import { DaemonicDaemon } from "../daemonicFaery.ts";
import { TOTP } from "otpauth";
import { writeFileSync, readFile } from "node:fs";

export class AuthCTL extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Config: {
        totpSecret: string,
        userDBLocation: string
    }
    \*--------------------------------*/
    onLoad(){
        // TOTP 
        this.variables["totp"]=new TOTP({
            "label": "DaemonicFaery: "+this.daemonicFaeryInstance.getFaeryStatus().hostname,
            "algorithm": "SHA1",
            "period": 30,
            "digits": 6,
            "secret": this.config.totpSecret
        });

    }
    start(){
        this.variables["users"]={};
        if (this.config.userDBLocation){
            readFile(this.config.userDBLocation, "utf-8", (error, data)=>{if(!error && data){
                try{
                    this.variables.users=JSON.parse(data);
                    this.pushLog(`UserData: Read from file.`);
                }catch(e){
                    this.pushLog(`UserData: Couldn't decode file. Probably not in JSON.`, false);
                }
            }else{
                this.pushLog(`UserData: Couldn't reading file. Probably doesn't exist.`, false);
            }});
        }else{
            this.pushLog(`UserData: No file location set for the UserDB file`, false);
        }

        this.sender("WebPort", "addListener", {
            webSignal: "addUser",
            respondWithSignal: "addUserCalled",
            willRespond: false,
            mandatoryParams: ["totp", "user", "pass"],
            description: "Add a new user to the Faery-wide auth system."
        });
        this.sender("WebPort", "addListener", {
            webSignal: "removeUser",
            respondWithSignal: "removeUserCalled",
            willRespond: false,
            mandatoryParams: ["totp", "user"],
            description: "Remove user from the Faery-wide auth system."
        });
    }
    stop(){
        this.sender("WebPort", "removeListener", "addUser");
        this.sender("WebPort", "removeListener", "removeUser");
    }
    receiver(from:string, signal:string, data:any, ID:string,){
        // TOTP 
        if(signal=="getTOTPSecretString"){
            this.pushLog(`Secret String sent to '${from}'`);
            this.sender(from, "TOTPSecretString", this.getTOTPSecretString(), ID);
        }else if(signal=="getCurrentTOTP"){
            this.pushLog(`Current TOTP sent to '${from}'`);
            this.sender(from, "CurrentTOTP", this.getCurrentTOTP(), ID);
        }else if(signal=="validateTOTP"){
            this.sender(from, "TOTPValidation", this.validateTOTP(data || ""), ID);
        }

        // User
        else if(signal=="addUserCalled"){
            if (this.validateTOTP(data.get("totp")||"")){this.addUser({user:(data.get("user")||""),pass:(data.get("pass")||"")});}
        }else if(signal=="removeUserCalled"){
            if (this.validateTOTP(data.get("totp")||"")){this.removeUser((data.get("user")||""));}
        }else if(signal=="addUser"){ // data -> {user:str, pass:str}
            this.addUser(data);
        }else if(signal=="removeUser"){ // data -> user:str
            this.removeUser(data);
        }else if(signal=="getUserSessionToken"){ // data -> {user:str, pass:str}
            this.sender(from, "userSessionToken", this.getUserSessionToken(data), ID);
        }else if(signal=="validateUser"){ // data -> {user:str, pass:str}
            this.sender(from, "userValidation", this.validateUser(data), ID);
        }
        else if(signal=="getUserData"){ // data -> user:str
            this.sender(from, "userData", {
                exists: data in this.variables.users
                //  ToDo: Make it so that you can add various properties to a user.
            }, ID);
        }
    }


    /*----------*\
    |    TOTP    |
    \*----------*/
    private getTOTPSecretString():string{return this.variables.totp.toString();}
    private getCurrentTOTP():string{return this.variables.totp.generate();}
    private validateTOTP(code:string):boolean{
        // ToDo: Lock system if TOTP is incorrect more than 3 times
        let returnValue=false;
        if(code==this.variables.totp.generate()){returnValue=true;}
        return returnValue;
    }

    /*----------*\
    |    User    |
    \*----------*/
    private passSalting(rawPass:string):string{return rawPass;} // ToDo----
    private getUserSessionToken(authCreds:{user:string,pass:string}):string{return "";} // ToDo----
    private validateUser(creds:{user:string,pass:string}):Boolean{
        // ToDo: Lock system if pass is incorrect more than 3 times
        if (typeof(this.variables.users[(creds||{}).user])=="string" && this.variables.users[(creds||{}).user]==this.passSalting((creds||{}).pass)){
            return true;
        }else{
            return false;
        }
    }
    private addUser(userCreds:{user:string, pass:string}){
        if (typeof(userCreds.user)=="string" && typeof(userCreds.pass)=="string"){
            if ((userCreds.user in this.variables.users) == false){
                this.pushLog(`User '${userCreds.user}' added`);
                this.variables.users[userCreds.user]=this.passSalting(userCreds.pass);
                
                if (this.config.userDBLocation){
                    try{
                        writeFileSync(this.config.userDBLocation, JSON.stringify(this.variables.users));
                        this.pushLog(`User '${userCreds.user}' saved to file`);
                    }catch(e){
                        this.pushLog(`Error saving user '${userCreds.user}' to file`, false);
                    }
                }
            }else{
                this.pushLog(`User '${userCreds.user}' already exists`);
            }
        }
    }
    private removeUser(user:string){
        if (user in this.variables.users){
            this.pushLog(`User '${user}' removed`);
            delete this.variables.users[user];

            if (this.config.userDBLocation){
                try{
                    writeFileSync(this.config.userDBLocation, JSON.stringify(this.variables.users));
                    this.pushLog(`User '${user}' removed from file`);
                }catch(e){
                    this.pushLog(`Error removing user '${user}' from file`, false);
                }
            }
        }
    }
}