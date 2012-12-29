# HopJS

HopJS is a RESTful based declarative API framework for Node.js 

*First, we simply define the interface you wish to expose*
```javascript

UserService={};

UserService.create=function(input,onComplete){
  // Here we would create a new user and call onComplete(err,result) when were done
}

UserService.authenicate=function(input,onComplete){
  // Here we would authenticate a user and call onComplete(err,result) when were done
}

```
*Next, we use Hop to define the interface, this will expose the interface via a RESTful API*

```javascript

//This will create a RESTful set of URLs which expose the following functions:
Hop.defineClass("UserService",UserService,function(api){
  api.post("create","/user").demand("email").demand("username").usage("Create a new user");
  api.post("authenticate","/user/auth").demand("email").demand("username").usage("Authenticate a user");
});

//Now tell HopJS to expose our API in express.js
Hop.exposeAPI("/api/",app)

```

Now that we've done that we get a few things:
 * We have our RESTful API
 * HopJS generates a client side API we can use in our browser which will have the following definitions:
   * UserService.create(input,onComplete)
   * UserService.authenticate(input,onComplete)

*But we can also define the test cases for our new interface!*

```javascript

Hop.defineTestCase("UserService.authenticate",function(test){
    var validUser = { email:"test@test.com", username:"TestUser" };
    test.do("UserService.create").with(validUser).noError();
    test.do("UserService.authenticate").with(validUser).noError();
    test.do("UserService.authenticate").with({password:"BOB"},validUser).hasError(/Permission denied/);
});

```
* Now let's suppose we wanted an Android set of client stubs for our API:

```shell
hopjs-gen -url http://www.website.com:3000/ android -outputDir ./androidApp -package com.website.www
```


# Known Issues
 - It is unclear how multiple versions of an API are supported
 - Add more tests

