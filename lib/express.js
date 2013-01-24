var Hop = require('./api');
var combustion = require('combustion')();
var fs = require('fs');
var path = require('path');
var util = require('hopjs-common');


/**
Inserts the Hop calls into express

@param {string} basePath 
	the path which the Hop will hang off of
@param {object} app 
	the express app

@for Hop
@method apiHook
**/
Hop.apiHook=function(basePath,app,options){
	
	options=options||{};

	Hop.basePath=basePath;
	for(var objectName in Hop.Objects){
		var obj = Hop.Objects[objectName];
		for(var methodName in obj.methods){
			var method = obj.methods[methodName];
			Hop.log(method.method,method.getPath());	
			(function(obj,method){
							app[method.method](method.getPath(),function(req,res){
								Hop.log("-",method.method,method.getPath());	

								var input = {};
						
								if(req.body._hopRedirect || req.query._hopRedirect){
									var redirect = req.body._hopRedirect || req.query._hopRedirect;
								}

								if(req.body._hopTemplate || req.query._hopTemplate){
									var template = req.body._hopTemplate || req.query._hopTemplate;
								}
	
								for(var paramName in method.params){
									var param = method.params[paramName];
									var value=undefined;
									if(method.method=="get" || method.method=="del" || method.method=="delete")
										value = req.params[paramName] || req.query[paramName];
									else if(method.method=="post" || method.method=="put") {
										if(req.files && (param.demandFile || param.optionalFile)){
											value = req.files[paramName];	
										} else if(req.body){
											value = req.params[paramName] || req.body[paramName];
										} else {
											value = req.params[paramName];
											
										}
									}
									if(param.demand && typeof value=="undefined"){
										return res.send(400,"Missing parameter:"+paramName);
									}
									input[paramName]=value;
								}
								//try {
									req._response = res;
									req.getResponse=function(){ return res; };
									var called=false;
									Hop.call(obj.name+"."+method.name,input,function(err,result){
											if(called){
												Hop.error(obj.name+"."+method.name,"called onComplete twice");	
											} else {
												called=true;
											try {
												if(redirect)
													return res.redirect(redirect);
												if(template)
													return res.render(template,{ result: result, error: err, request: req});	

												if(err){
													res.send(500,err);
													Hop.error(err);
												} else {
													if(result instanceof Hop.File){
														result.send(res);
													} else {
														if(result===null || result===undefined){
															res.send(404,"Not found");
														} else { 
															res.json(result);
														}
													}
												}
											} catch(e){
												Hop.error(e);
											}
										}
									},req);
								/*
								} catch(e){
									res.send(500,e.toString()+"\n"+e.stack());	
								}*/
							});
			})(obj,method);
		}
	}
	var cwd = path.join(path.dirname(module.filename),"../");
	Hop.docURL = util.webpath.join(basePath,"/");
	app.get(util.webpath.join(basePath,"/"),function(req,res){
		var apiChecksum = (Hop.checksum());
		fs.readFile(path.join(cwd,"static/doc.comb"),function(err,data){
			var template = combustion(data.toString());
			res.set('Content-Type', 'text/html');
			res.send(template({ Hop: Hop, _csrf: req.session._csrf }));
		});
	});
	Hop.apiURL = util.webpath.join(basePath,"api.js");
	app.get(util.webpath.join(basePath,"api.js"),function(req,res){
		var apiChecksum = (Hop.checksum());
		if(req.get("If-Non-Match")==apiChecksum){
			return res.send("Not modified",304);
		}
		var file = path.join(cwd,"static/api.comb");
		fs.readFile(file,function(err,data){
			try {
				var template = combustion(data.toString());
			

				res.set('Content-Type', 'application/javascript');
				res.set('Content-Type', 'text/html');
				res.set("ETag",apiChecksum);	
				res.set("Hop-Checksum",apiChecksum);
				
				res.send(template({ Objects: Hop.Objects, Models: Hop.Models, _csrf: (req.session?req.session._csrf:null)}));

			} catch (e){
				Hop.error("Error parsing : api.js",e);
				Hop.error(e.stack());
			}
		});
	});
	Hop.testURL=util.webpath.join(basePath,"test.js");

	app.get(util.webpath.join(basePath,"test.js"),function(req,res){
		var apiChecksum = (Hop.checksum());
		if(req.get("If-Non-Match")==apiChecksum){
			return res.send("Not modified",304);
		}
		fs.readFile(path.join(cwd,"static/test.comb"),function(err,data){
			var template = combustion(data.toString());
			res.set('Content-Type', 'application/javascript');
			res.set("ETag",apiChecksum);	
			res.send(template(Hop));
		});
	});
	app.get(util.webpath.join(basePath,"/api.json"),function(req,res){
		res.contentType("application/json");
		res.send(Hop.toJSON());
	});
	app.get("/_hopjs/",function(req,res){
		res.redirect(basePath);
	});
	app.get("/_hopjs/api.json",function(req,res){
		res.contentType("application/json");
		res.send(Hop.toJSON());
	});
	app.get("/_hopjs/apitest.json",function(req,res){
		res.contentType("application/json");
		res.send(JSON.stringify(Hop.TestCases));
	});
	app.get("/_hopjs/apitest.js",function(req,res){
		res.contentType("text/javascript");
		res.send(Hop.TestCase.toStandAlone());
	});
	app.get("/_hopjs/*",function(req,res){
		if(req.params[0].indexOf("..")!=-1)
			return res.send(404,"Not found");
		var file = path.join(__dirname,"../static/_hopjs",req.params[0]);
		console.log(file);
		res.sendfile(file);
	});
}

var cwd = path.join(path.dirname(module.filename),"../");


/**
Render a template using the cumbustion template engine

@param {string} filename The filename of the template relative to the "./static" path
@param {object} input The inputs to the template

@for Hop
@method renderTemplate
**/
Hop.renderTemplate=function(filename,input){
	try {
		var file = path.join(cwd,"static",filename);
		if(fs.existsSync(file)){
			var data = fs.readFileSync(file);
		} else {
			var data = fs.readFileSync(filename);
		}
		if(!data){
			return "Invalid template specified:"+filename;	
		}
		var template = combustion(data.toString(),input);
		return template;
	} catch(e){
		Hop.error(e);
		Hop.error(e.stack());
		return (file+":"+e.toString());
	}
}
