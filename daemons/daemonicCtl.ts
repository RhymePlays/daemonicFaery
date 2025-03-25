import { DaemonicDaemon } from "../daemonicFaery.ts";

export class DaemonicCTL extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies: WebPort, TOTP

    Daemon Config: ToDo: Pull response strings from Config.

    Daemon Usage: Basic WebPort Usage.
    
    \*--------------------------------*/
    start(){
        this.sender("WebPort", "addListener", {
            webSignal: "getFaeryStatus",
            respondWithSignal: "getFaeryStatusCalled",
            willRespond: true
        });
        this.sender("WebPort", "addListener", {
            webSignal: "getDaemonStatus",
            respondWithSignal: "getDaemonStatusCalled",
            willRespond: true,
            mandatoryParams: ["daemonName"]
        });
        this.sender("WebPort", "addListener", {
            webSignal: "startDaemon",
            respondWithSignal: "startDaemonCalled",
            mandatoryParams: ["totp", "daemonName"]
        });
        this.sender("WebPort", "addListener", {
            webSignal: "stopDaemon",
            respondWithSignal: "stopDaemonCalled",
            mandatoryParams: ["totp", "daemonName"]
        });
        this.sender("WebPort", "addListener", {
            webSignal: "sendSignal",
            respondWithSignal: "sendSignalCalled",
            mandatoryParams: ["totp", "daemonName", "signal"],
            optionalParams: ["data"],
            description: "Send an Inter-Daemon-Comms signal from this Daemon. No callback will be returned."
        });
        this.sender("WebPort", "addListener", {
            webSignal: "getLogs",
            respondWithSignal: "getLogsCalled",
            willRespond: true,
            mandatoryParams: ["totp"],
            description: "Get Daemonic Faery Logs."
        });
    }

    stop(){
        this.sender("WebPort", "removeListener", "getFaeryStatus");
        this.sender("WebPort", "removeListener", "getDaemonStatus");
        this.sender("WebPort", "removeListener", "startDaemon");
        this.sender("WebPort", "removeListener", "stopDaemon");
        this.sender("WebPort", "removeListener", "sendSignal");
        this.sender("WebPort", "removeListener", "getLogs");
    }

    receiver(from:string, signal:string, data:any, ID:string){
        if(signal=="getFaeryStatusCalled"){
            this.sender("WebPort", "sendWebResponse", {webSignal: "getFaeryStatus", webResponse: JSON.stringify(this.daemonicFaeryInstance.getFaeryStatus())});
        }else if (signal=="getDaemonStatusCalled"){    
            this.sender("WebPort", "sendWebResponse", {webSignal: "getDaemonStatus", webResponse: JSON.stringify(this.daemonicFaeryInstance.getDaemonStatus(data.get("daemonName")))});
        }else if(signal=="startDaemonCalled"){
            this.sender("AuthCTL", "validateTOTP", data.get("totp"), undefined, async(totpValidation:boolean)=>{
                if (totpValidation){
                    this.daemonicFaeryInstance.startDaemon(data.get("daemonName"));
                }
            });
        }else if(signal=="stopDaemonCalled"){
            this.sender("AuthCTL", "validateTOTP", data.get("totp"), undefined, async(totpValidation:boolean)=>{
                if (totpValidation){
                    this.daemonicFaeryInstance.stopDaemon(data.get("daemonName"));
                }
            });
        }else if(signal=="sendSignalCalled"){
            this.sender("AuthCTL", "validateTOTP", data.get("totp"), undefined, async(totpValidation:boolean)=>{
                if (totpValidation){
                    this.sender(data.get("daemonName"), data.get("signal"), data.get("data"));
                }
            });
        }else if(signal=="getLogsCalled"){
            this.sender("AuthCTL", "validateTOTP", data.get("totp"), undefined, async(totpValidation:boolean)=>{
                if (totpValidation){
                    this.sender("LogCTL", "getLogs", undefined, undefined, (logs:any)=>{
                        this.sender("WebPort", "sendWebResponse", {webSignal: "getLogs", webResponse: JSON.stringify(logs)});
                    })
                }else{
                    this.sender("WebPort", "sendWebResponse", {webSignal: "getLogs", webResponse: "Incorrect TOTP!"});
                }
            });
        }
    }
}