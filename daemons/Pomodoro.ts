import { DaemonicDaemon } from "../daemonicFaery.ts";

export class Pomodoro extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies:

    Daemon Config: {
        focusTimeInMS: number,
        breakTimeInMS: number,
        longBreakTimeInMS: number,
        longBrakeAfterNthCycle: number
    }

    Daemon Usage:
    
    \*--------------------------------*/
    loop(){ // focus(0+even_n) => break(odd_n) => longBreak(if n>=nthBreak) => repeat (0 again)
        if (this.variables.phase%2 == 0){
            this.pushLog(`Start Working! (For ${(this.config.focusTimeInMS/(60*1000))||25} mins)`); // ToDo: Push Notification
            
            this.variables.phase=this.variables.phase+1;
            this.variables.timer = setTimeout(()=>{this.loop();}, this.config.focusTimeInMS||25*60*1000);
        }else if(Math.ceil(this.variables.phase/2)>=(this.config.longBrakeAfterNthCycle||4)){
            this.pushLog(`Take a Long Break! (For ${(this.config.focusTimeInMS/(60*1000))||15} mins)`); // ToDo: Push Notification

            this.variables.phase=0;
            this.variables.timer = setTimeout(()=>{this.loop();}, this.config.longBreakTimeInMS||15*60*1000);
        }else{
            this.pushLog(`Take a Break! (For ${(this.config.focusTimeInMS/(60*1000))||5} mins) [ ${(this.config.longBrakeAfterNthCycle||4)-Math.ceil(this.variables.phase/2)} ]`); // ToDo: Push Notification
            
            this.variables.phase=this.variables.phase+1;
            this.variables.timer = setTimeout(()=>{this.loop();}, this.config.breakTimeInMS||5*60*1000);
        }
    }
    start(){
        this.variables.phase = 0;
        this.loop();
    }
    stop(){clearTimeout(this.variables.timer);}
}