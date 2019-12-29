---
layout: post
title: 如何科学上网
---

其实，只用一个简单的SSH命令就可以科学上网。

当然，你还需要一台境外的服务器，位于香港的也可以。在阿里云上，买一台按量付费的1c1g的机器，大概每小时花费0.12元，公网流量费用为1G流量1块钱。按量付费的机器好处在于，不需要的时候，你可以将它释放。因此对于非长期或频繁使用的人来说，基于按量付费机器来科学上网是一个极具性价比的途径。

## SOCKS协议

在开始之前，我们先了解下SOCKS协议。在通常情况下，我们访问别的服务时是直接向服务提供者发送请求；但在一些网络受限的情况下，我们的请求需要经过一台网关机，然后由网关机再进行服务访问并返回结果。如果是HTTP或HTTPS类型服务，我们可以考虑在网关机部署一个NGINX服务，由NGINX转发代理请求。但如果是POP3、SMTP、FTP等类型服务呢？或者网关机需要对客户端进行身份认证呢？NGINX就显得捉襟见肘，甚至爱莫能助了。

这就是SOCKS协议的使用场景。SOCKS协议位于OSI模型第5层（即会话层），我们可以在网关机上搭建一个SOCKS代理，这个代理支持多种协议的请求代理，如HTTP、HTTPS、POP3、SMTP、FTP等，并且支持使用多种身份认证方式。

下面根据[SOCKS5文档](https://tools.ietf.org/html/rfc1928)来解剖下基于TCP的请求转发，不感兴趣的同学可以直接跳过阅读下一小节。

首先，客户端需要先跟SOCKS代理建立连接。客户端需要发送如下数据包到SOCKS代理：

![auth](/assets/how-to-connect-the-world/auth.png)

* VER字段：长度为1个字节，表示SOCKS协议版本，例如SOCKS V5此字段值为X'05'。（注：X'05'使用两个十六进制数来表示一个字节的值）
* NMETHOD：长度为1个字节，值表示METHODS字段的字节长度。
* METHODS：认证方法。

然后，SOCKS代理会返回如下响应：

![auth-reply](/assets/how-to-connect-the-world/auth-reply.png)

VER字段的含义跟上面说的含义一样。METHOD如果值为X'FF'，那么SOCKS代理认为所有的认证方法都不符合要求，客户端需要关闭连接。当前已定义的METHOD值有：

* X'00': 表示不需要认证；
* X'01': GSSAPI；
* X'02': USERNAME/PASSWORD;
* X'03': 到X'7F'， 由IANA分配;
* X'80': 到X'FE'，为私有认证方法保留；
* X'FF': 客户端给出的所有认证方法都不被接受；

客户端收到此响应后，会跟SOCKS代理进行相应认证方法的身份认证（除非是返回X'FF'，客户端需要关闭连接）。

当完成身份认证之后，客户端向SOCKS发送如下请求：

![request](/assets/how-to-connect-the-world/request.png)

* VER: 表示SOCKS协议版本；
* CMD: X'01'表示CONNECT，X'02'表示BIND，X'03'表示UDP关联；
* RSV: 保留字段；
* ATYP: 目标地址类型，X'01'表示IPV4地址，X'03'表示域名，X'04'表示IPV6；
* DST.ADDR: 目标地址；上面截图中显示“Variable”是因为，如果ATYP为IPV4地址，那么此字段长度为4个字节；如果ATYP为域名，那么此字段第一个字节表示域名字节长度，然后紧跟着域名值；如果ATYP为IPV6，那么长度为16个字节；
* DST.PORT: 目标端口；

SOCKS代理收到此请求后，根据源地址和目标地址情况，会返回如下结果：

![reply](/assets/how-to-connect-the-world/reply.png)

* VER: 表示SOCKS版本；
* REP: 
   * X'00' 成功；
   * X'01' SOCKS服务器错误；
   * X'02' 连接不被允许；
   * X'03' 网络不可达；
   * X'04' 目标主机不可达；
   * X'05' 连接拒绝；
   * X'06' TTL过期；
   * X'07' 命令不支持；
   * X'08' 地址类型不支持；
   * X'09' 到X'FF'未使用；
* RSV：保留字段；
* ATYP: 表示BND.ADDR的地址类型，X'01'表示IPV4地址，X'03'表示域名，X'04'表示IPV6；
* BND.ADDR: 服务器绑定地址；
* BND.PORT: 服务器绑定端口；

如果客户端发送的为CONNECT请求，那么BND.ADDR和BND.PORT为SOCKS代理提供用于连接目标服务器的IP和端口。由于SOCKS代理一般工作于网关机，而网关机可能有多个网卡，这里的BND.ADDR可能跟客户端最初与SOCKS代理通信的地址不同。

而BIND请求通常用于客户端接受服务端的连接。比如FTP，客户端通过Client-to-Server的连接来发送命令和状态汇报，而服务端则使用Server-to-Client连接来按需传输数据。在BIND中，SOCKS代理会返回两次响应。第一次响应中，SOCKS代理会返回用于监听的IP和端口，分别对应于BND.ADDR和BND.PORT字段。然后客户端通常使用主连接来将此约定信息告知服务端，服务端尝试与此IP与端口建立连接。这时候SOCKS代理会返回第二次响应结果，如果连接成功，则BND.ADDR和BND.PORT包含建立连接的地址和端口。

## SSH建立SOCKS代理

SSH建立SOCKS代理非常简单，例如：

```
ssh -D 127.0.0.1:8087 root@46.51.136.243
```

上面命令使用root身份跟46.51.136.243这台服务器来建立ssh通道，并且在本地8087端口建立一个SOCKS代理；SOCKS代理接收的数据会通过ssh通道来传输给46.51.136.243，并进一步发送到相应服务端。

对，就是这么简单。

如果你的服务器是境外服务器，那么现在可以科学上网了。假如你使用mac系统的话，可以在网络设置中配置SOCKS代理，例如：

![socks](/assets/how-to-connect-the-world/socks.png)

保存配置后，就可以愉快的科学上网了。顺便说一句，阿里云的香港服务器用于科学上网的速度还是挺快的:)
