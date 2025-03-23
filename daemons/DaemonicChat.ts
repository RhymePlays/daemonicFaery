import { DaemonicDaemon } from "../daemonicFaery.ts";

export class DaemonicChat extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies:

    Daemon Config:

    Daemon Usage:
    
    \*--------------------------------*/
    // Defineable
    onLoad(){
        // Callable
        this.sender("DaemonName", "signal", {});
        this.sender("DaemonName", "signal", {}, undefined, ()=>{});
        this.pushLog("Log");
        this.daemonicFaeryInstance.getLogs();
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