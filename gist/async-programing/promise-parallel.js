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
