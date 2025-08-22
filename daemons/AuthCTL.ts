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
                this.pushLog(`UserData: Couldn't read file. Probably doesn't exist.`, false);
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
        this.sender("WebPort", "addListener", {
            webSignal: "generateUserToken",
            respondWithSignal: "genUserTokenCalled",
            willRespond: true,
            mandatoryParams: ["user", "pass"],
            description: "Generate temporary session token for a user."
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
            if (this.validateTOTP(data.get("totp"))){this.addUser({user:data.get("user"), pass:data.get("pass")});}
        }else if(signal=="removeUserCalled"){
            if (this.validateTOTP(data.get("totp"))){this.removeUser(data.get("user"));}
        }else if(signal=="genUserTokenCalled"){
            this.sender("WebPort", "sendWebResponse", {webSignal: "generateUserToken", webResponse: this.genUserSessionToken({user: data.get("user"), pass: data.get("pass")})});
        }else if(signal=="addUser"){ // data -> {user:str, pass:str}
            this.addUser(data);
        }else if(signal=="removeUser"){ // data -> user:str
            this.removeUser(data);
        }else if (signal=="addUserProperty"){ // [Add/Update] data -> {user:str, property:str, value:str}
            this.addProperty(data);
        }else if (signal=="removeUserProperty"){ // data -> {user:str, property:str}
            this.removeProperty(data);
        }else if(signal=="getUserProperties"){ // data -> user:str
            this.sender(from, "userProperties", this.getProperty(data), ID);
        }else if (signal=="addUserAsAdmin"){ // data -> user:str
            this.addUserAsAdmin(data);
        }else if (signal=="removeUserAsAdmin"){ // data -> user:str
            this.removeUserAsAdmin(data);
        }else if(signal=="isUserAdmin"){ // data -> user:str
            this.sender(from, "userProperties", this.isUserAdmin(data), ID);
        }else if(signal=="generateUserSessionToken"){ // data -> {user:str, pass:str}
            this.sender(from, "userSessionToken", this.genUserSessionToken(data), ID);
        }else if(signal=="validateUser"){ // data -> {user:str, pass?:str, token?:str}
            this.sender(from, "userValidation", this.validateUser(data), ID);
        }else if(signal=="validateAdmin"){ // data -> {user:str, pass:str}
            this.sender(from, "adminValidation", this.validateAdmin(data), ID);
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
    private genUserSessionToken(creds:{user:string,pass:string}):string{
        if(this.validateUser(creds)){
            let token = this.daemonicFaeryInstance.generateUUID();

            this.variables.users[creds.user].lastTokenGenTime = Date.now();
            this.variables.users[creds.user].activeTokens.push(this.passSalting(token));
            while (this.variables.users[creds.user].activeTokens.length > (this.config.maxTokenPerUser||5)){
                this.variables.users[creds.user].activeTokens.shift();
            }
    
            return token;
            
            // ToDo: clean all tokens if currentTime-lastTokenGenTime > tokenLifetimeMS
        }
        return "";
    }
    private validateUser(creds:{user:string,pass?:string,token?:string}):Boolean{
        // ToDo: Lock system if pass is incorrect more than 3 times
        if ((creds||{}).user in this.variables.users){
            if ((creds||{}).pass){
                if (this.variables.users[(creds||{}).user].pass==this.passSalting(((creds||{}).pass)||"")){
                    return true;
                }else{
                    return false;
                }
            }else if((creds||{}).token){
                if (this.variables.users[(creds||{}).user].activeTokens.includes(this.passSalting(((creds||{}).token)||""))){
                    return true;
                }else{
                    return false;
                }
            }else{
                return false;
            }
        }else{
            return false;
        }
    }
    private validateAdmin(creds:{user:string,pass:string}):Boolean{
        if(this.isUserAdmin((creds||{}).user) && this.validateUser(creds)){
            return true;
        }else{
            return false
        };
    }
    private addProperty(data:{user:string, property:string, value:string}):Boolean{
        if ((data||{}).user in this.variables.users){
            this.variables.users[(data||{}).user].properties[(data||{}).property]==this.passSalting((data||{}).value);
            return true;
        }
        return false;
    }
    private removeProperty(data:{user:string, property:string, value:string}):Boolean{
        if ((data||{}).user in this.variables.users){
            delete this.variables.users[(data||{}).user].properties[(data||{}).property];
            return true;
        }
        return false;
    }
    private getProperty(user:string){
        if (user in this.variables.users){
            return Object.assign(this.variables.users[user].properties, {exists: true});
        }else{
            return {exists: false};
        }
    }
    private addUserAsAdmin(user:string):Boolean{
        if (user in this.variables.users){
            this.variables.users[user].isAdmin==true;
            return true;
        }
        return false;
    }
    private removeUserAsAdmin(user:string):Boolean{
        if (user in this.variables.users){
            this.variables.users[user].isAdmin==false;
            return true;
        }
        return false;
    }
    private isUserAdmin(user:string):Boolean{
        if ((this.variables.users[user]||{}).isAdmin==true){
            return true;
        }
        return false;
    }
    private addUser(userCreds:{user:string, pass:string}){
        if (typeof(userCreds.user)=="string" && typeof(userCreds.pass)=="string"){
            if ((userCreds.user in this.variables.users) == false){
                this.pushLog(`User '${userCreds.user}' added`);
                this.variables.users[userCreds.user]={
                    pass: this.passSalting(userCreds.pass),
                    creationTime: Date.now(),
                    lastAccessTime: 0,
                    lastTokenGenTime: 0,
                    isAdmin: false,
                    activeTokens: [],
                    properties: {}
                }
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