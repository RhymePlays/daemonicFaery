import { DaemonicDaemon } from "../daemonicFaery.ts";

export class DaemonicPing extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies:

    Daemon Config:

    Daemon Usage:
    
    \*--------------------------------*/
    onLoad(){
        this.sender("DaemonName", "signal", {});
        this.sender("DaemonName", "signal", {}, undefined, ()=>{});
        this.pushLog("Log");
        this.daemonicFaeryInstance.getFaeryStatus();
        this.daemonicFaeryInstance.getDaemonStatus("DaemonName");
        this.daemonicFaeryInstance.startDaemon("DaemonName");
        this.daemonicFaeryInstance.stopDaemon("DaemonName");

        // Readable
        this.daemonicFaeryInstance;
        this.config;
        this.variables;
    }
    start(){}
    stop(){}
    receiver(from:string, signal:string, data:any, ID:string){
        this.sender("DaemonName", "signal", {}, ID);
    }
}