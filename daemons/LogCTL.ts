import { DaemonicDaemon } from "../daemonicFaery.ts";

export class LogCTL extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies:

    Daemon Config:

    Daemon Usage:
    
    \*--------------------------------*/
    // Defineable
    onLoad(){}
    start(){}
    stop(){}
    receiver(from:string, signal:string, data:any, ID:string){
    }
}