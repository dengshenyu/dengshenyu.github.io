name: inverse
layout: true
class: center, middle, inverse

---
# 异步编程

.footnote[By [CatTail](https://github.com/cattail)]

---
layout: false

## 提纲

* preface
* callback
* async
* promise
* ES6 generator

---
## preface

JavaScript作为一个单线程语言，当浏览器执行一些延时操作，如等待网络响应或DOM事件时，JavaScript需要通过异步的方法防止线程阻塞。

本文介绍了异步编程的一些解决方案。

---
## callback

异步编程最简单的方式就是使用回调函数。

但是在代码中大量使用回调使得可读性和可维护性变得很差。

![callback hell](/assets/callback-hell.png)

---
## async

除此之外，单纯使用回调无法实现异步循环，并行操作。

通过[async](https://github.com/caolan/async)解决了这个问题。

---
### 循环

```javascript
var async = require('async');
var count = 0;

async.whilst(
    function () { return count < 5; },
    function (callback) {
        console.log(count++);
        setTimeout(callback, 1000);
    },
    function (err) {
        // 5 seconds have passed
    }
);
```

---
### 并行

```javascript
var async = require('async');
async.parallel([
    function(callback){
        setTimeout(function(){
            callback(null, 'one');
        }, 200);
    },
    function(callback){
        setTimeout(function(){
            callback(null, 'two');
        }, 100);
    }
],
// optional callback
function(err, results){
    // the results array will equal ['one','two'] even though
    // the second function had a shorter timeout.
});
```

---
## promise

async使得通过回调的异步编程方法可以解决几乎所有需求，但是代码可读性仍然很差。

[promise](http://promises-aplus.github.io/promises-spec/)在某种程度上提高了代码可读性。

---
### promise

```javascript
var Q = require('q');

function timeout() {
    var defer = Q.defer();
    setTimeout(function() {
        console.log(1);
        defer.resolve();
    }, 1000);
    return defer.promise;
}

timeout()
    .then(timeout)
    .then(timeout);
```

---
### 循环

```javascript
var Q = require('q');

function timeout() {
    var defer = Q.defer();
    setTimeout(function() {
        console.log(1);
        defer.resolve();
    }, 1000);
    return defer.promise;
}

var i = 0;
var p = timeout();
while(i<5) {
    i++;
    p = p.then(timeout);
}
```

---
### 并行

```javascript
var Q = require('q');

function timeout() {
    var defer = Q.defer();
    setTimeout(function() {
        console.log(1);
        defer.resolve();
    }, 1000);
    return defer.promise;
}

Q.all([timeout(), timeout()])
    .then(timeout)
    .done(timeout)
    ;
```

---
## ES6 generator

---
### demo

```javascript
async(function *() {
    yield defer(1000);
    yield defer(1000);
    yield defer(1000);
});

function defer(time) {
    return function(callback) {
        setTimeout(function() {
            callback();
        }, time);
    };
};

function async(generator) {
    var iterator = generator();
    var value = iterator.next().value;
    next();
    function next() {
        if (value) {
            value(function() {
                value = iterator.next().value;
                next();
            });
        }
    }
}
```

---
## Q & A
