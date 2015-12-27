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
