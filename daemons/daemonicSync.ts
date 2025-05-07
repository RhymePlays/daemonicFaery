import { DaemonicDaemon } from "../daemonicFaery.ts";

export class DaemonicSync extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies:

    Daemon Config:

    Daemon Usage:
    
    \*--------------------------------*/
    onLoad(){}
    start(){}
    stop(){}
    receiver(from:string, signal:string, data:any, ID:string){}
}