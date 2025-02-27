import { DaemonicDaemon } from "../daemonicFaery.ts";
import { TOTP } from "otpauth";

export class TOTPAuth extends DaemonicDaemon {
    onLoad(){
        this.variables["totp"]=new TOTP({
            "label": "DaemonicFaery: "+this.daemonicFaeryInstance.getFaeryStatus().hostname,
            "algorithm": "SHA1",
            "period": 30,
            "digits": 6,
            "secret": this.config.totpSecret
        });
    }

    private getSecretString():string{return this.variables.totp.toString();}
    private getCurrentTOTP():string{return this.variables.totp.generate();}
    private validateTOTP(code:string):boolean{
        let returnValue=false;
        if(code==this.variables.totp.generate()){returnValue=true;}
        return returnValue;
    }

    receiver(from:string, signal:string, data:any, ID:string,){
        if(signal=="getSecretString"){
            this.pushLog(`Secret String sent to '${from}'`);
            this.sender(from, "TOTPSecretString", this.getSecretString(), ID);
        }else if(signal=="getCurrentTOTP"){
            this.pushLog(`Current TOTP sent to '${from}'`);
            this.sender(from, "CurrentTOTP", this.getCurrentTOTP(), ID);
        }else if(signal=="validateTOTP"){
            this.pushLog(`TOTP validation requested by '${from}'`);
            this.sender(from, "TOTPValidation", this.validateTOTP(data || ""), ID);
        }
    }
}