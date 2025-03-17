import { DaemonicDaemon } from "../daemonicFaery.ts";

export class NotificationCTL extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies:

    Daemon Config:

    Daemon Usage:
    
    \*--------------------------------*/
    start(){
        this.sender("WebPort", "addListener", {
            webSignal: "pushNotification",
            respondWithSignal: "pushNotificationCalled",
            mandatoryParams: ["totp", "text"]
        });
    }
    stop(){this.sender("WebPort", "removeListener", "pushNotification");}
    receiver(from:string, signal:string, data:any, ID:string){
        if (signal=="push"){
            // Send notification to notification manager
        }
    }
}