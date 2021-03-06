var express= require('express');
var path = require('path');

var Hop = require("./../../index");

/*
  This is express boiler plate, see http://expressjs.com/guide.html
*/
var app = express();
app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.urlencoded());
  app.use(express.json());
  app.use(express.methodOverride());
  app.use(express.cookieParser('your secret here'));
  app.use(express.session());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.engine("jade",require('jade').__express);

app.get("/",function(req,res){
	res.render("index",{Hop:Hop});
});

/* 
  Here is our list of users, in a real app we'd need a db of sorts
*/
var users={};
var lastUserId=0;

/*
 Here is our static class for supporting the user APIs
*/
var UserService = {}

/**
  Here is our create user function that we want to make an API
  
  It validates the user and will add it to our user hash above. 

  Each API function that can be called by HopJS will have the following parameters

  function(input,onComplete,request)
    input - the input object we got from the API call, this shouldn't be null
    onComplete(err,result) - the lambda to call when were done with our work
      err - A string error to be returned
      result - The object or primative to return
    request - the express object as provided by request (optional)

  The important thing to note here is Hop expects a few things when calling the onComplete
    - If you have a result, error must be null
    - If you have an error, result must be null
    - If you have no error and no result, both can be null (this will return a 404)

  Lastly you may override the status code by providing the desired status code as the third parameter to the
  call back. 

    ex: return onComplete("Invalid email address", null, 400);

  Most of the test below will check to make sure your returning the right things from the onComplete

    

*/

/**

  These two classes are just simple examples of how content can be used 
  by href's or expanded in line. 

*/
UserRoles={};
UserRoles.list=function(input,onComplete){
  return onComplete(null,{ items:[ "admin","user"]});
}

UserGroups={};
UserGroups.list=function(input,onComplete){
  return onComplete(null,{ items:[ "sales"]});
}

UserService.create=function(input,onComplete){

  if(!/.{3,100}/.test(input.email)){
    return onComplete("Invalid email address specified: "+input.email);
  }
  
  if(!/[A-Za-z0-9]{3,100}/.test(input.name)){
    return onComplete("Invalid name specified: "+input.name);
  }

  /* Let's add this user to our list of known users */
  users[lastUserId]={ email:input.email, name: input.name, password: input.password, id:lastUserId};

  var user = users[lastUserId];

  //Here we explicitly tell Hop what call to use to refer to this object. 
  user.href=new Hop.href("UserService.read",{id: user.id, kittens:"5>3" });

  //Here two references to the groups the user belongs to; we're essentially saying
  // provide the url for these calls in the result, but if we wanted to the end
  // consumer of the API can use the expand keyword to expand upon these hrefs. 
  user.roles={ href: new Hop.href("UserRoles.list",{id:user.id})};
  user.groups={ href: new Hop.href("UserGroups.list",{id:user.id})};

  lastUserId++;

	return onComplete(null,user.href);
}

UserService.patch=function(input,onComplete){
  if(users[input.id]){
    for(var i in input){
      users[input.id][i]=input[i];
    }
    return onComplete(null,users[input.id]);
  } else return onComplete(null,null);
}

UserService.read=function(input,onComplete){
  return onComplete(null,users[input.id]);
}

UserService.authenticate=function(credentials,onComplete,request){
  for(var i in users){
    var user = users[i];
    if(user.name==credentials.name && user.password==credentials.password){
      /*
        Lets put the user in our session, see here for more details: http://expressjs.com/api.html#cookieSession
      */
      request.session.user=user;
      return onComplete(null,user);
    } 
  } 
  return onComplete("Permission denied");
}

UserService.del=function(input,onComplete,request){
  if(users[input.id]!=undefined){
    console.log("Deleted user with id:",input.id);
    delete users[input.id];
    return onComplete(null,true);
  } else {  
    return onComplete(null,false);
  }
}

UserService.list=function(input,onComplete){
  return onComplete(null,{ items: users });   
} 


UserService.currentUser=function(input,onComplete,request){
  return onComplete(null,request.session.user);
}

UserService.logout=function(input,onComplete,request){
  delete request.session.user;
  return onComplete(null,true);
}

Hop.defineClass("UserGroups",UserGroups,function(api){
  api.list("list","/user/:id/groups");
});

Hop.defineClass("UserRoles",UserRoles,function(api){
  api.list("list","/user/:id/roles");
});

/*
  Here we'll tell Hop about our service, 
    - We'll name the service "UserService" - this is what all the client side stubs will use
    - Then we'll tell Hop where to find the object that backs our service, this can be a static class or proper JavaScript class
    - Then our lambda which defines the class
*/
Hop.defineClass("UserService",UserService,function(api){
  /* Tell us what the API is used for */
	api.usage("Manages users");

  /* 
    Here we'll define our RESTful URLs 
  
    - We can define four types of RESTful URLs, get, post, put and delete - which take the name of the function in the service, and the path for the URL
    - We can also demand certain parameters be passed in when calling these functions
  */
	api.create("create","/user").demand("email","The email address for the user").demand("name","The user's name").demand("password","The password for the user");
  api.list("list","/user/");
	api.get("logout","/user/logout");
  api.patch("patch","/user/:id").optionals("email","name","password");
  api.read("read","/user/:id");
	api.post("authenticate","/user/auth").demand("password").demand("name");
	api.get("currentUser","/user");
  api.del("del","/user/:id").demand("id");
});

/*  
  Now let's define a test case for our service. i

  Hop will allow us to reuse this testcase when possible in other languages and on other platforms, so by defining this you might get a native Android, Shell, or browser based
  test framework which can run this test case!

  The test case will execute each step in sequence, and test for the various modifiers. 
  
  We must name each test case using one of our methods defined above as a prefix, this way Hop knows how to test that method. In the example below we see the test
  case is associated with UserService.create, anything after the ':' is considered a description.

  There are a wide variety of possible tests for each call such as:
    .noError()
    .inputSameAsOutput()

  Typically you'll only need one of these as each one of them will attempt to perform general validation that the call worked. So .noError() will also check to make sure that no
  result was returned. See /lib/test.js for a full list of possible tests

*/
Hop.defineTestCase("UserService.create: Basic tests",function(test){

  /* First we'll define what we thing is a valid user */
	var validUser = { email:"test@test.com", name:"TestUser", password:"sillycat" };

  /* We want to call the UserService.create function 
      - with the valid user we defined above
      - and expect the input to be a subset of the output
      - and we want to save the result of this call as "createdUser"
  */
	test.do("UserService.create").with(validUser,{expand:true}).outputContains(validUser).saveOutputAs("createdUser");

  /*
    Now we want to delete the user we created above. This works because UserService.del only requires 
    a single parameter 'id' - everything else is ignored. And since the function above adds an 'id'
    field to identifiy the user this works as expect. 
  */
  test.do("UserService.del").with("createdUser").noError();

});

/*
  Here is a more advanced test for UserService.create
*/
Hop.defineTestCase("UserService.create: Advanced",function(test){
	var validUser = { email:"test@test.com", name:"TestUser", password:"sillycat" };

	test.do("UserService.create").with(validUser,{expand:true}).outputContains(validUser).saveOutputAs("createdUser");
	test.do("UserService.create").with(validUser,{name:undefined}).errorContains("Missing parameter");
	test.do("UserService.create").with(validUser,{email:"X"}).errorContains("Invalid email");
	test.do("UserService.create").with(validUser,{name:"@#$"}).errorContains("Invalid name");

  test.do("UserService.del").with("createdUser").noError();
});


/*
  Test for user authentication 
*/
Hop.defineTestCase("UserService.authenticate",function(test){
	var validUser = { email:"test@test.com", name:"AuthUser", password:"sillycat" };
	test.do("UserService.create").with(validUser,{expand:true}).outputContains(validUser).saveOutputAs("createdUser");
  test.do("UserService.logout").noError();
	test.do("UserService.authenticate").with({name:"authuser",password:"badpass"}).errorContains("Permission denied");
  test.do("UserService.currentUser").noError().outputIsNull();
	test.do("UserService.authenticate").with({name:"AuthUser",password:"sillycat"}).noError();
  test.do("UserService.currentUser").outputSameAs("createdUser");
  
  test.do("UserService.del").with("createdUser").noError();
});

Hop.defineTestCase("UserService.patch",function(test){
	var validUser = { email:"test@test.com", name:"AuthUser", password:"sillycat" };
	test.do("UserService.create").with(validUser,{expand:true}).outputContains(validUser).saveOutputAs("createdUser");
  test.do("UserService.patch").with("createdUser",{email:"foo@foo.com"}).noError().outputContains({email:"foo@foo.com"}).saveOutputAs("createdUser");
  test.do("UserService.list").noError();
  test.do("UserService.read").with("createdUser").outputHasProperty("href");
});

/**
  In this test we're gonna see if we can expand inline items. We will make sure that we get just href's sometimes
  and then can expand groups and roles
*/
Hop.defineTestCase("UserService.read:expand",function(test){
	var validUser = { email:"test@test.com", name:"AuthUser", password:"sillycat" };
	test.do("UserService.create").with(validUser,{expand:true}).outputContains(validUser).saveOutputAs("createdUser");
  test.do("UserService.read").with("createdUser").outputHasProperty("roles.href");
  test.do("UserService.read").with("createdUser",{expand:"roles"}).outputContains({ roles:{items:["admin","user"]}});
  test.do("UserService.read").with("createdUser",{expand:"roles", expand:"groups"}).outputContains({ roles:{items:["admin","user"]}}).outputContains({ groups:{items:["sales"]}});;
});


Hop.apiHook("/api/",app);

app.listen(3000);

