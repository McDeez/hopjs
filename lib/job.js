/**
  Provides generic job functionality

  @beta

  @module Hop
  @submodule Job
**/
var Hop = require('./api');
var crypto = require('crypto');

var JobStatus = function(){

}

JobStatus.wait=function(input,onComplete){
  Hop.Job.load(input.jobID,function(err,job){

    if(err)
      return onComplete(err);
  
    if(job && job.finished){
      return onComplete(job.err,job.result);
    }

    Hop.Job.wait(input.jobID,function(err,result){
      return onComplete(err,result);  
    });  
  });
}

JobStatus.listen=function(input,onComplete){
  Hop.Job.load(input.jobID,function(err,job){

    if(err)
      return onComplete(err);
  
    if(job && job.finished){
      return onComplete(null, {msg: job.msg||"", percent: job.percent||100});
    }

    Hop.Job.listen(input.jobID,function(msg,percent){
      return onComplete(null,{msg: msg, percent: percent});  
    });  
  });
}


JobStatus.load=function(input,onComplete){
  Hop.Job.load(input.jobID,function(err,job){
    return onComplete(err,job);  
  });
}


Hop.defineClass("JobStatus",JobStatus,function(api){
  api.get("wait","/_job/wait/:jobID").demand("jobID");
  api.get("listen","/_job/listen/:jobID").demand("jobID");
  api.get("load","/_job/:jobID").demand("jobID");
});

Hop.addBeforeTemplate("JavaScript","job/preJSHop.comb");

Hop.Method.prototype.jobMaxStall=function(duration){
  if(!this.job)
    this.job={};
  this.job.maxStall=duration;
  return this;
}

Hop.Method.prototype.jobMinDuration=function(duration){
  if(!this.job)
    this.job={};
  this.job.minDuration=duration;
  return this;
}

Hop.Method.prototype.jobMaxDuration=function(duration){
  if(!this.job)
    this.job={};
  this.job.maxDuration=duration;
  return this;
}

Hop.Method.prototype.trackJob=function(jobPath,duration,allowRepeatIfFinished){
  duration=duration||(24*60*60);
  var self=this;

  self.addAfterTemplate("JavaScript","job/postJSMethod.comb");

  self.addPreCall(function(req,input,onComplete,next){
    
    if(jobPath){
      jobPath=Hop.Job.resolvePath(jobPath,req,input);
    }
    if(jobPath){
      Hop.Job.loadByPath(jobPath,function(err,job){
        if(job){
          var forceNew = false;
          if(job.started && !job.finished){
            var jobDuration = Math.ceil(((new Date()).getTime()-job.started)/1000.0);
            if(self.job && self.job.maxDuration){
              if(jobDuration > self.job.maxDuration)
                forceNew = true;
            }
            Hop.log("jobDuration",jobDuration);
          }
          if(job.updated && !job.finished){
            var jobStall = Math.ceil(((new Date()).getTime()-job.updated)/1000.0);
            if(self.job && self.job.maxStall){
              if(jobStall > self.job.maxStall)
                forceNew = true;
            }
            Hop.log("jobStall",jobStall);
          }


          if(allowRepeatIfFinished && job.finished){
              var jobID = Hop.Job.id();
              req.getResponse().set("Job-ID",jobID);
              req.getResponse().set("Job-Status","new-repeat");
              req.job = new Hop.Job(jobID);
              req.job.start(jobPath,duration,function(){
                if(req.get("Job-No-Wait")==null){
                  next();
                } else {
                  onComplete(err,jobID);
                  next();
                }
              });  
          } else {
            if(job.finished){ 
                req.getResponse().set("Job-Status","finished");
                req.getResponse().set("Job-ID",job.jobID);
                return onComplete(job.err,job.result);
            } else {
              //FIXME we have issue here, what if the job is actually dead?
              // we need some metrics to determine at what point the job should 
              // be considererd dead.
              if(forceNew){
                var jobID = Hop.Job.id();
                req.getResponse().set("Job-ID",jobID);
                req.getResponse().set("Job-Status","new-repeat");
                req.job = new Hop.Job(jobID);
                req.job.start(jobPath,duration,function(){
                  if(req.get("Job-No-Wait")==null){
                    next();
                  } else {
                    onComplete(err,jobID);
                    next();
                  }
                });  

              } else {
                req.getResponse().set("Job-Status","existing");
                req.getResponse().set("Job-ID",job.jobID);
                if(req.get("Job-No-Wait")==null){
                  Hop.Job.wait(job.jobID,function(err,result){
                    return onComplete(err,result);
                  });  
                } else return onComplete(err,jobID);
              }
            }
          }
        } else {
          var jobID = Hop.Job.id();
          req.getResponse().set("Job-ID",jobID);
          req.getResponse().set("Job-Status","new-foo");
          req.job = new Hop.Job(jobID);
          req.job.start(jobPath,duration,function(){
            if(req.get("Job-No-Wait")==null){
              next();
            } else { 
              onComplete(err,jobID);
              next();
            }
          });  
        }
      });
    } else {
        var jobID = Hop.Job.id();
        req.getResponse().set("Job-ID",jobID);
        req.getResponse().set("Job-Status","new-bar");
        req.job = new Hop.Job(jobID);
        req.job.start(jobPath,duration,function(){
          if(req.get("Job-No-Wait")==null){
            next();
          } else { 
            onComplete(err,jobID);
            next();
          }
        });  
    }
  });
  self.addPostCall(function(req,input,error,result,onComplete){
    if(req.job){
      req.job.finish(error,result,function(err,res){
        return onComplete();  
      });
    } else {
      return onComplete();
    }
  });
  return this;
}

Hop.Job=function(id){
  this.jobID=id;
}

Hop.Job.id=function(){
  var id=crypto.createHash("md5");
  id.update((new Date().toString())+":"+Math.random()*10000+"");
  return id.digest("hex");
}

Hop.Job.resolvePath=function(path,req,input){
  var request=req;
  return path.replace(/:([^\/]+)/g,function(m,s){
    if(s){
      try {
        with(input){
          var v = eval(s);
          if(v==undefined){
            throw "Undefined value found in cache path: "+s;
          }
          return v.toString();
        }
      } catch(e){
        throw "Error in cache path: "+s+" is "+e;
      }
    }
  });

}


Hop.Job.prototype.start=function(jobPath,duration,onComplete){
  var job = { 
    jobID: this.jobID,
    started: new Date().getTime(),
    expiresAt: new Date().getTime() + (duration*1000)
  };
  if(jobPath!=null){
    job.path = jobPath;
  }

  Hop.Job.save(this.jobID,job,onComplete);
}

Hop.Job.prototype.finish=function(jobErr,jobResult,onComplete){
  var self=this;
  Hop.Job.load(self.jobID,function(err,job){
    if(!err && job){
      job.finished = new Date().getTime();
      job.err=jobErr;
      job.result=jobResult;
      Hop.Job.save(self.jobID,job,function(err,res){
        Hop.Job.notifyStatus(self.jobID, job.msg||"", job.percent||100,function(){

          Hop.Job.notifyFinished(self.jobID,jobErr,jobResult,onComplete);

        });
      });
    } else onComplete(err,null);
  });
}

Hop.Job.prototype.setStatus=function(msg,percent,onComplete){
  onComplete=onComplete||function(){};
  var self=this;
  Hop.Job.load(self.jobID,function(err,job){
    if(!err && job){
      job.msg=msg;
      job.percent=percent;      
      job.updated = (new Date()).getTime();
      Hop.Job.save(self.jobID,job,function(err,res){
        Hop.Job.notifyStatus(self.jobID, job.msg, job.percent,onComplete);
      });
    } else onComplete(err,null);
  });
}

Hop.Job.prototype.getStatus=function(onComplete){
  Hop.Job.load(this.jobID,function(err,job){
    if(!err && job){
      onComplete(null, { percent: job.percent, msg: job.msg });  
    } else onComplete(err,null);
  });
}

module.exports=Hop;
