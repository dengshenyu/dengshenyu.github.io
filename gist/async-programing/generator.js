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

async(function *() {
    defer = curry(defer);
    yield defer(1000);
    yield defer(1000);
    yield defer(1000);
    yield defer(1000);
    yield defer(1000);
    yield defer(1000);
    yield defer(1000);
});

function defer(time, callback) {
    setTimeout(function() {
        callback();
    }, time);
}

function defer2(time) {
    return function(callback) {
        setTimeout(function() {
            callback();
        }, time);
    };
};

function curry(func) {
    return function() {
        var args = Array.prototype.slice.call(arguments);
        return function(cb) {
            args.push(cb);
            func.apply(null, args);
        };
    };
}
