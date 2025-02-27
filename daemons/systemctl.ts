import { DaemonicDaemon } from "../daemonicFaery.ts";
import { type } from "os";

export class SystemCTL extends DaemonicDaemon {
    /*--------------------------------*\
    Daemon Dependencies: RestAPI, TOTPAuth

    Daemon Config:

    Daemon Usage:
    
    \*--------------------------------*/
    async runSh(command: String){
        try{return await Bun.$`${command}`.text();}
        catch(e){return "error";}
    }

    onLoad(){this.variables["OS"]=type();}
    start(){
        this.sender("RestAPI", "addListener", {
            webSignal: "poweroff",
            respondWithSignal: "poweroffCalled",
            willRespond: false,
            mandatoryParams: ["totp"],
            optionalParams: ["OSPass"]
        });
        this.sender("RestAPI", "addListener", {
            webSignal: "restart",
            respondWithSignal: "restartCalled",
            willRespond: false,
            mandatoryParams: ["totp"],
            optionalParams: ["OSPass"]
        });
        this.sender("RestAPI", "addListener", {
            webSignal: "sleep",
            respondWithSignal: "sleepCalled",
            willRespond: false,
            mandatoryParams: ["totp"],
            optionalParams: ["OSPass"]
        });
        this.sender("RestAPI", "addListener", {
            webSignal: "runSh",
            respondWithSignal: "runShCalled",
            willRespond: true,
            mandatoryParams: ["totp", "sh"],
            optionalParams: ["OSPass"]
        });
        this.sender("RestAPI", "addListener", {
            webSignal: "getLogs",
            respondWithSignal: "getLogsCalled",
            willRespond: true,
            mandatoryParams: ["totp"]
        });
        this.sender("RestAPI", "addListener", {
            webSignal: "getFaeryStatus",
            respondWithSignal: "getFaeryStatusCalled",
            willRespond: true
        });
        this.sender("RestAPI", "addListener", {
            webSignal: "getDaemonStatus",
            respondWithSignal: "getDaemonStatusCalled",
            willRespond: true,
            mandatoryParams: ["daemonName"]
        });
        this.sender("RestAPI", "addListener", {
            webSignal: "startDaemon",
            respondWithSignal: "startDaemonCalled",
            willRespond: false,
            mandatoryParams: ["totp", "daemonName"]
        });
        this.sender("RestAPI", "addListener", {
            webSignal: "stopDaemon",
            respondWithSignal: "stopDaemonCalled",
            willRespond: false,
            mandatoryParams: ["totp", "daemonName"]
        });
    }
    stop(){this.sender("RestAPI", "removeListener", "poweroff");}
    
    async receiver(from:string, signal:string, data:any, ID:string){
        if(signal=="getFaeryStatusCalled"){
            this.sender("RestAPI", "sendWebResponse", {webSignal: "getFaeryStatus", webResponse: JSON.stringify(this.daemonicFaeryInstance.getFaeryStatus())});
        }else if(signal=="poweroffCalled"){ // webSignal=poweroff&totp=000000&OSPass=string
            this.sender("TOTPAuth", "validateTOTP", (data.get("totp")||""), undefined, async(totpValidation:boolean)=>{
                if (this.variables.OS=="Linux" && totpValidation){
                    this.runSh(`echo ${data.get("OSPass")} | sudo -S systemctl poweroff`);
                }else if(this.variables.OS=="Windows_NT" && totpValidation){
                    this.runSh("ToDo");
                }
            });
        }else if(signal=="runShCalled"){ // webSignal=runSh&totp=000000&sh=cmd
            this.sender("TOTPAuth", "validateTOTP", (data.get("totp")||""), undefined, async(totpValidation:boolean)=>{
                if (totpValidation){
                    this.sender("RestAPI", "sendWebResponse", {webSignal: "runSh", webResponse: await this.runSh(data.get("sh"))});
                }else{
                    this.sender("RestAPI", "sendWebResponse", {webSignal: "runSh", webResponse: "Incorrect TOTP!"});
                    // ToDo: Lock system if TOTP is incorrect more than 3 times
                }
            });
        }else if(signal=="getLogsCalled"){
            this.sender("TOTPAuth", "validateTOTP", (data.get("totp")||""), undefined, async(totpValidation:boolean)=>{
                if (totpValidation){
                    this.sender("RestAPI", "sendWebResponse", {webSignal: "getLogs", webResponse: JSON.stringify(this.daemonicFaeryInstance.getLogs())});
                }else{
                    this.sender("RestAPI", "sendWebResponse", {webSignal: "getLogs", webResponse: "Incorrect TOTP!"});
                    // ToDo: Lock system if TOTP is incorrect more than 3 times
                }
            });
        }
    }
}