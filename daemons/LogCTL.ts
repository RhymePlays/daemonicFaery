import { DaemonicDaemon } from "../daemonicFaery.ts";
import chalk from "chalk";

export class LogCTL extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies:

    Daemon Config:

    Daemon Usage:
    
    \*--------------------------------*/
    onLoad(){
        this.variables.log = [];
        this.config.maxLogSize=this.config.maxLogSize||100;
    }
    start(){

    }
    stop(){

    }
    receiver(from:string, signal:string, data:any, ID:string){
        switch(signal){

            case "pushLog":
                if(typeof(data.log)=="string"){
                    while(this.variables.log.length>=this.config.maxLogSize){this.variables.log.shift();}
                    this.variables.log.push([
                        data.successStatus||true,
                        Date.now(),
                        data.source||"DaemonicFaery",
                        data.log
                    ]);

                    let logItem = this.variables.log[this.variables.log.length-1];
                    if (logItem[2]=="DaemonicFaery"){
                        console.log(`${chalk.redBright("")}${chalk.bgRedBright.bold(logItem[2])}${chalk.redBright("")} ${logItem[0]?chalk.redBright("  ")+chalk.white(logItem[3]):chalk.redBright("  ")+chalk.redBright(logItem[3])}\n`);
                    }else{
                        console.log(`${chalk.cyan("")}${chalk.bgCyan.bold(logItem[2])}${chalk.cyan("")} ${logItem[0]?chalk.cyan("  ")+chalk.gray(logItem[3]):chalk.cyan("  ")+chalk.redBright(logItem[3])}\n`);
                    }
                }
                break;
            
            case "getMaxLogSize":
                this.sender(from, "maxLogSize", this.config.maxLogSize, ID);
                break;
            
            case "getLogs":
                this.sender(from, "logs", this.variables.log, ID);

        }
    }
}