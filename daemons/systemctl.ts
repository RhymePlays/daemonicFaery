import { DaemonicDaemon } from "../daemonicFaery.ts";
import { type } from "node:os";
import { exec } from "node:child_process";

export class SystemCTL extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies: WebPort, AuthCTL

    Daemon Config: ToDo: Pull response strings from Config.

    Daemon Usage: Basic WebPort Usage.
    
    \*--------------------------------*/
    async runSh(command: string){
        return new Promise((resolve, reject)=>{
            try{
                exec(command, (error, stdout, stderr)=>{
                    if(stderr || error){
                        // this.pushLog("Sh execution error! -> "+command, false);
                        resolve({response: `${stderr}\n${error}` || "Error!", success: false});
                    }else{
                        resolve({response: stdout || "Done!", success: true});
                    }
                });
            }catch(e){
                // this.pushLog("Sh execution error! -> "+command, false);
                resolve({response: "Error!", success: false});
            }
        })
    }

    onLoad(){this.variables["OS"]=type();}
    start(){
        this.sender("WebPort", "addListener", {
            webSignal: "poweroff",
            respondWithSignal: "poweroffCalled",
            willRespond: false,
            mandatoryParams: ["totp"],
            optionalParams: ["OSPass"],
            description: "Poweroff host system. Linux only."
        });
        this.sender("WebPort", "addListener", {
            webSignal: "reboot",
            respondWithSignal: "rebootCalled",
            willRespond: false,
            mandatoryParams: ["totp"],
            optionalParams: ["OSPass"],
            description: "Reboot host system. Linux only."
        });
        this.sender("WebPort", "addListener", {
            webSignal: "sleep",
            respondWithSignal: "sleepCalled",
            willRespond: false,
            mandatoryParams: ["totp"],
            optionalParams: ["OSPass"],
            description: "Put host system to Sleep. Linux only."
        });
        this.sender("WebPort", "addListener", {
            webSignal: "runSh",
            respondWithSignal: "runShCalled",
            willRespond: true,
            mandatoryParams: ["totp", "sh"],
            description: "Execute shell commands."
        });
    }
    stop(){
        this.sender("WebPort", "removeListener", "poweroff");
        this.sender("WebPort", "removeListener", "reboot");
        this.sender("WebPort", "removeListener", "sleep");
        this.sender("WebPort", "removeListener", "runSh");
    }
    
    async receiver(from:string, signal:string, data:any, ID:string){
        if(signal=="poweroffCalled"){
            this.sender("AuthCTL", "validateTOTP", (data.get("totp")||""), undefined, async(totpValidation:boolean)=>{
                if (this.variables.OS=="Linux" && totpValidation){
                    this.pushLog("Attempting to Poweroff system!");
                    this.runSh(`echo ${data.get("OSPass")} | sudo -S systemctl poweroff`);
                }
            });
        }if(signal=="rebootCalled"){
            this.sender("AuthCTL", "validateTOTP", (data.get("totp")||""), undefined, async(totpValidation:boolean)=>{
                if (this.variables.OS=="Linux" && totpValidation){
                    this.pushLog("Attempting to reboot system!");
                    this.runSh(`echo ${data.get("OSPass")} | sudo -S systemctl reboot`);
                }
            });
        }if(signal=="sleepCalled"){
            this.sender("AuthCTL", "validateTOTP", (data.get("totp")||""), undefined, async(totpValidation:boolean)=>{
                if (this.variables.OS=="Linux" && totpValidation){
                    this.pushLog("Attempting to put system to sleep!");
                    this.runSh(`echo ${data.get("OSPass")} | sudo -S systemctl sleep`);
                }
            });
        }else if(signal=="runShCalled"){
            this.sender("AuthCTL", "validateTOTP", (data.get("totp")||""), undefined, async(totpValidation:boolean)=>{
                if (totpValidation){
                    this.sender("WebPort", "sendWebResponse", {webSignal: "runSh", webResponse: await this.runSh(data.get("sh"))});
                }else{
                    this.sender("WebPort", "sendWebResponse", {webSignal: "runSh", webResponse: "Incorrect TOTP!"});
                }
            });
        }

        else if(signal=="runSh"){
            if(data){
                this.sender(from, "runShCB", await this.runSh(data), ID);
            }
        }
    }
}