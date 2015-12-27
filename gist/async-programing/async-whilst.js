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
