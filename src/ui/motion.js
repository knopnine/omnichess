export function movementPose(from,to,progress,fitRadius=from.fitRadius) {
    const t=1-(1-Math.max(0,Math.min(1,progress)))**3;
    return {
        x:from.center.x+(to.center.x-from.center.x)*t,
        y:from.center.y+(to.center.y-from.center.y)*t,
        fitRadius,
    };
}

export function surfacePose(style,from,to,progress,fitRadius,travelFiles,crossedSeam=false) {
    const pose=movementPose(from,to,progress,fitRadius);
    const file=cell=>cell.x??(cell.s===0?cell.f:7-cell.f);
    const files=travelFiles??file(to)-file(from),t=1-(1-Math.max(0,Math.min(1,progress)))**3;
    if(style==='donut') {
        const angle=Math.atan2(from.center.y,from.center.x)+files*Math.PI/4*t;
        const start=Math.hypot(from.center.x,from.center.y),end=Math.hypot(to.center.x,to.center.y),radius=start+(end-start)*t;
        pose.x=Math.cos(angle)*radius;pose.y=Math.sin(angle)*radius;
    } else if((style==='mobius-8x8' && files!==file(to)-file(from)) || (style==='mobius' && (crossedSeam || Math.abs(to.y-from.y)>7))) {
        const center=progress<.5?from.center:to.center;
        pose.x=center.x;pose.y=center.y;pose.opacity=Math.abs(2*progress-1);
    }
    return pose;
}

export class MoveAnimation {
    constructor({requestFrame,cancelFrame,now,onFrame,onFinish,reducedMotion=()=>false}) {
        Object.assign(this,{requestFrame,cancelFrame,now,onFrame,onFinish,reducedMotion});
        this.active=null; this.frame=null; this.generation=0;
    }
    start(data,duration) {
        this.cancel();
        if(this.reducedMotion())return false;
        this.active={data,duration,start:this.now(),progress:0};
        const generation=++this.generation;
        const tick=()=>{
            if(!this.active || generation!==this.generation)return;
            this.frame=null;
            this.active.progress=Math.min(1,Math.max(0,(this.now()-this.active.start)/this.active.duration));
            if(this.active.progress>=1){this.active=null;this.onFinish();this.onFrame();return;}
            this.onFrame();
            if(this.active && generation===this.generation)this.frame=this.requestFrame(tick);
        };
        this.onFrame();
        if(!this.active || generation!==this.generation)return false;
        this.frame=this.requestFrame(tick);
        return true;
    }
    cancel() {
        this.generation++;
        if(this.frame!==null)this.cancelFrame(this.frame);
        this.frame=null;
        const wasActive=!!this.active;this.active=null;
        if(wasActive)this.onFinish();
    }
}
