name: inverse
layout: true
class: center, middle, inverse

---
# 异步 I O 初探

.footnote[By [CatTail](https://github.com/cattail)]

---
layout: false

## 提纲

* 实现
* Nodejs异步I/O

---
## 实现

* `read`
* `select`
* `poll`, `epoll`
* libevent, libev, libuv

---
![introduction-to-async](/assets/introduction-to-async.png)

---
## `read`

进程在读取过程中被阻塞

```c
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/uio.h>

int main(void)
{
    char buf[80];

    // read
    ssize_t size = read(fileno(stdin), buf, sizeof(buf));

    if (size == -1) {
        perror("read()");
        exit(EXIT_FAILURE);
    }

    printf("%s", buf);

    return EXIT_SUCCESS;
}
```

---
## non-block `read`

设置文件描述符为非阻塞

* 成功: 数据长度
* 等待: -1, 设置`errno`为`EAGAIN`
* EOF: 0

轮询

```c
int fd = fileno(stdin);

int flags = fcntl(fd, F_GETFL, 0);
fcntl(fd, F_SETFL, flags | O_NONBLOCK);

// manual poll
while (size = read(fd, buf, sizeof(buf))) {
    if (size == -1) {
        if (errno != EAGAIN) {
            exit(EXIT_FAILURE);
        }
        // data not ready, wait and check again
        sleep(3);
    }
}

printf("%s", buf);
```

---
class: smaller

## `select`: multiplexing

等待多个串行接口

```c
int serial1, serial2;
char buf[BUFSIZ];

read(serial1, buf, sizeof(buf));
read(serial2, buf, sizeof(buf));
```

```c
void setNonblocking(int fd)
{
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

int serial1, serial2;

setNonblocking(serial1);
setNonblocking(serial2);

read(serial1, buf, sizeof(buf));
read(serial2, buf, sizeof(buf));

int fd = serial1;
while (size = read(fd, buf, sizeof(buf))) {
    if (size == -1) {
        if (errno != EAGAIN) {
            exit(EXIT_FAILURE);
        }
        // data not ready, wait and check again
        // switch
        fd = serial2;
        sleep(3);
    }
}
```

---
class: smaller

select监听多个文件描述符状态变更

* 超时: 0
* 错误: -1
* 返回可用fd数量

```c
fd_set readfs;
int fds[LENGTH];

fds[0] = fileno(stdin);
fds[1] = socket(...);

/* loop for input */
while (1) {
    FD_ZERO(&readfs);
    for (i=0; i<LENGTH; i++)
    {
        FD_SET(fds[i], &readfs);
    }

    /* block until input becomes available */
    result = select(maxfd, &readfs, NULL, NULL, &tv);

    switch(result)
    {
        case -1:
            perror("select()");
            break;
        case 0:
            printf("Timeout\n");
            break;
        default:
            for (i=0; i<maxfd; i++)
            {
                if (FD_ISSET(fds[i], &readfs))
                {
                    read(fds[i], buf, sizeof(buf));
                    printf("%s", buf);
                }
            }
    }
}
```

---
## `epoll`: optimize

和`select`相似, 监听多个文件描述符事件

操作

* `epoll_create`: 创建epoll文件描述符
* `epoll_ctl`: 操作epoll文件描述符
* `epoll_wait`: 等待I/O事件

---
Block HTTP server

```c
// block
conn_sock = accept(listen_sock, (struct sockaddr *) &local, &addrlen);
// block
send(conn_sock, buffer, recv(conn_sock, buffer, MAXBUF, 0), 0);
```


---
`accept`在接受请求时, 能同时处理当前可以返回数据的连接

```c
struct epoll_event ev, events[MAX_EVENTS];
/* Set up listening socket, 'listen_sock' (socket(), bind(), listen()) */
int listen_sock, conn_sock, nfds, epollfd;

epollfd = epoll_create(10);

ev.events = EPOLLIN;
ev.data.fd = listen_sock;
epoll_ctl(epollfd, EPOLL_CTL_ADD, listen_sock, &ev);

for (;;) {
   nfds = epoll_wait(epollfd, events, MAX_EVENTS, -1);

   for (n = 0; n < nfds; ++n) {
       if (events[n].data.fd == listen_sock) {
           conn_sock = accept(listen_sock, (struct sockaddr *) &local, &addrlen);

           setnonblocking(conn_sock);
           ev.events = EPOLLIN | EPOLLET;
           ev.data.fd = conn_sock;
           epoll_ctl(epollfd, EPOLL_CTL_ADD, conn_sock, &ev);
       } else {
           conn_sock = events[n].data.fd;
           send(conn_sock, buffer, recv(conn_sock, buffer, MAXBUF, 0), 0);
       }
   }
}
```

---
## libevent

* 使用平台相关的内核API获取事件变更
* 指定文件描述符事件(或延时等)发生后调用回调函数.

```c
struct event_base *base = event_base_new();

struct timeval five_seconds = {5,0};

struct event *ev1, *ev2;
ev1 = event_new(base, fd1, EV_TIMEOUT|EV_READ|EV_PERSIST, cb_func,
    (char*)"Reading event");
ev2 = event_new(base, fd2, EV_WRITE|EV_PERSIST, cb_func,
    (char*)"Writing event");

event_add(ev1, &five_seconds);
event_add(ev2, NULL);

event_base_loop(base);
```

---
class: smaller
## 初始化: `event_base_new`

`event_base_new` -> `epoll_init` -> `epoll_create`

使用`epoll_create`创建epoll文件描述符

```c
static void *
epoll_init(struct event_base *base)
{
	int epfd;
	struct epollop *epollop;

	/* Initialize the kernel queue.  (The size field is ignored since
	 * 2.6.8.) */
*	if ((epfd = epoll_create(32000)) == -1) {
		if (errno != ENOSYS)
			event_warn("epoll_create");
		return (NULL);
	}

	evutil_make_socket_closeonexec(epfd);

	if (!(epollop = mm_calloc(1, sizeof(struct epollop)))) {
		close(epfd);
		return (NULL);
	}

	epollop->epfd = epfd;

	/* Initialize fields */
	epollop->events = mm_calloc(INITIAL_NEVENT, sizeof(struct epoll_event));
	if (epollop->events == NULL) {
		mm_free(epollop);
		close(epfd);
		return (NULL);
	}
	epollop->nevents = INITIAL_NEVENT;

	if ((base->flags & EVENT_BASE_FLAG_EPOLL_USE_CHANGELIST) != 0 ||
	    ((base->flags & EVENT_BASE_FLAG_IGNORE_ENV) == 0 &&
		evutil_getenv("EVENT_EPOLL_USE_CHANGELIST") != NULL))
		base->evsel = &epollops_changelist;

	evsig_init(base);

	return (epollop);
}
```

---
## 监听事件: `event_add`

`event_add` -> `event_add_internal` -> `evmap_io_add` -> `epoll_ctl`

---
class: smaller
## 循环: `event_base_loop`

`event_base_loop` -> `epoll_dispatch` -> `epoll_wait`

1. 等待事件发生
2. 遍历变更文件描述符列表, 执行对应文件描述符注册的时间回调列表.

```pseudo
while (any events are registered with the loop,
        or EVLOOP_NO_EXIT_ON_EMPTY was set) {

    if (EVLOOP_NONBLOCK was set, or any events are already active)
        If any registered events have triggered, mark them active.
    else
*        Wait until at least one event has triggered, and mark it active.

    for (p = 0; p < n_priorities; ++p {
       if (any event with priority of p is active) {
          Run all active events with priority of p.
          break; /* Do not run any events of a less important priority */
       }
    }

    if (EVLOOP_ONCE was set or EVLOOP_NONBLOCK was set)
       break;
}
```

`event_base`内部通过一个哈希表(base->io)存储fd和它绑定的事件列表. 其中fd作为哈希表的key, 一个包含绑定事件列表的结构作为哈希表的值

---
# libev, libuv

libevent: chromium

libev
> A full-featured and high-performance (see benchmark) event loop that is loosely modelled after libevent, but without its limitations and bugs.

libuv: Nodejs

> In case any project watchers are wondering, libev served us well but:
> It only supports level-triggered I/O. On Linux, we want to use edge-triggered mode - it cuts down the number of syscalls by a substantial margin.
> libev's inner loop does a lot of things we don't really need. Gutting the inner loop like we did in 649ad50 gave a 40% performance increase on some benchmarks.

接口相似

读取文件(在后面会提到)

```c
UV_EXTERN int uv_fs_read(uv_loop_t* loop, uv_fs_t* req, uv_file file,
    void* buf, size_t length, int64_t offset, uv_fs_cb cb);
```

---
## 小结

* 内核API:
    * `read`
    * `select`
    * `poll`, `epoll`
    * etc

非阻塞, 轮询, 操作系统相关

* 库
    * libevent
    * libev
    * libuv

基于内核API, 事件->回调, 循环检测

---
class: center, middle, inverse

## Nodejs异步I/O

* Nodejs初始化
* 异步调用

---
class: smaller

## 1. Nodejs初始化

`main` -> `Start` -> `CreateEnvironment` -> `Load`

```c
int main(int argc, char *argv[]) {
  return node::Start(argc, argv);
}
```


```c
int Start(int argc, char** argv) {
    ...
    Environment* env =
        CreateEnvironment(node_isolate, argc, argv, exec_argc, exec_argv); // 初始化Nodejs
    ...
    uv_run(env->event_loop(), UV_RUN_DEFAULT); // 启动事件循环
}
```

```c
Environment* CreateEnvironment(Isolate* isolate,
                               int argc,
                               const char* const* argv,
                               int exec_argc,
                               const char* const* exec_argv) {
  ...
  Load(env);
  ...
}
```

使用`node.js` javascript文件初始化Nodejs环境
```c
void Load(Environment* env) {
  Local<String> script_name = FIXED_ONE_BYTE_STRING(node_isolate, "node.js");
  Local<Value> f_value = ExecuteString(MainSource(), script_name);
  Local<Function> f = Local<Function>::Cast(f_value);
  f->Call(global, 1, &arg);
}
```

---
## `node.js`文件

定义全局函数和变量, 如`console`

```javascript
(function(process) {
    ...
    global.__defineGetter__('console', function() {
        return NativeModule.require('console');
    });
    ...
});
```

---
## 2. 异步调用

以`fs.read`API举例介绍异步调用实现

```javascript
fs.read(fd, buffer, offset, length, position, callback)
```

---
在Nodejs首先以javascript实现这个API (lib/fs.js)

```javascript
fs.read = function(fd, buffer, offset, length, position, callback) {
  if (!util.isBuffer(buffer)) {
    // legacy string interface (fd, length, position, encoding, callback)
    var cb = arguments[4],
        encoding = arguments[3];

    assertEncoding(encoding);

    position = arguments[2];
    length = arguments[1];
    buffer = new Buffer(length);
    offset = 0;

    callback = function(err, bytesRead) {
      if (!cb) return;

      var str = (bytesRead > 0) ? buffer.toString(encoding, 0, bytesRead) : '';

      (cb)(err, str, bytesRead);
    };
  }

  function wrapper(err, bytesRead) {
    // Retain a reference to buffer so that it can't be GC'ed too soon.
    callback && callback(err, bytesRead || 0, buffer);
  }

*  binding.read(fd, buffer, offset, length, position, wrapper);
};
```

---
而`binding`是这样定义的

```javascript
var binding = process.binding('fs');
```

最终`binding.read`的实现在C++代码中, 使用libuv `uv_fs_read`实现事件-回调

```cpp
static void Read(const FunctionCallbackInfo<Value>& args) {
  ...
  if (cb->IsFunction()) {
*    uv_fs_read (env->event_loop(), &req_wrap->req_, fd , buf , len , pos , After);
  } else {
      // sync call
      ...
  }
}
```

在`After`中会执行javascript中传入的回调函数

```
fs.read(cb) -> binding.read() -> Read() -> uv_fs_read(cb) -- after a while -> cb()
     |                                   |                                      |
     v                                   v                                      v
     javascript                          c, c++                                 javascript
```

---
# After a while

* 工作被提交到线程池执行
* 执行完成后修改工作状态
* 主线程空先后执行完成任务的回调

---
![node thread model](/assets/node-thread-model.png)

---
## 小结

* Nodejs启动过程中初始化全局变量和函数, 并提供javascript调用C++的入口
* Nodejs异步调用最终在C++模块中实现, 通过使用libuv提供的事件-回调实现
