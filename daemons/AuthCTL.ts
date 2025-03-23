import { DaemonicDaemon } from "../daemonicFaery.ts";
import { TOTP } from "otpauth";
import { writeFileSync, readFile } from "node:fs";

export class AuthCTL extends DaemonicDaemon{
    onLoad(){
        // TOTP 
        this.variables["totp"]=new TOTP({
            "label": "DaemonicFaery: "+this.daemonicFaeryInstance.getFaeryStatus().hostname,
            "algorithm": "SHA1",
            "period": 30,
            "digits": 6,
            "secret": this.config.totpSecret
        });

        // User
        this.variables["users"]={};
        if (this.config.userDBLocation){
            try{
                readFile(this.config.userDBLocation, "utf-8", (error, data)=>{if(!error && data){this.variables.users=data;}});
                this.pushLog(`User data loaded from file`);
            }catch(e){
                this.pushLog(`Error loading user data from file`, false);
            }
        }else{
            this.pushLog(`No file location set for the UserDB file`, false);
        }
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
        else if(signal=="addUser"){ // data -> {user:str, pass:str}
            if (typeof(data.user)=="string" && typeof(data.pass)=="string"){
                this.pushLog(`User '${data.user}' added by ${from}`);
                this.variables.users[data.user]=this.passSalting(data.pass);
                
                if (this.config.userDBLocation){
                    try{
                        writeFileSync(this.config.userDBLocation, JSON.stringify(data.variables.users));
                        this.pushLog(`User '${data.user}' saved to file`);
                    }catch(e){
                        this.pushLog(`Error saving user '${data.user}' to file`, false);
                    }
                }
            }
        }else if(signal=="removeUser"){ // data -> user:str
            if (data in this.variables.users){
                this.pushLog(`User '${data}' removed by ${from}`);
                delete this.variables.users[data];

                if (this.config.userDBLocation){
                    try{
                        writeFileSync(this.config.userDBLocation, JSON.stringify(data.variables.users));
                        this.pushLog(`User '${data.user}' removed from file`);
                    }catch(e){
                        this.pushLog(`Error removing user '${data.user}' from file`, false);
                    }
                }
            }
        }else if(signal=="getUserSessionToken"){ // data -> {user:str, pass:str}
            this.sender(from, "userSessionToken", this.getUserSessionToken(data), ID);
        }else if(signal=="validateUser"){ // data -> {user:str, pass:str}
            this.sender(from, "userValidation", this.validateUser(data), ID);
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
        if (this.variables.users[(creds||{}).user]==this.passSalting((creds||{}).pass)){
            return true;
        }else{
            return false;
        }
    }
}