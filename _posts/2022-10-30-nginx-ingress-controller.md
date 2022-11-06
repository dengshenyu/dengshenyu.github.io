---
layout: post
title: 云原生组件分析--Nginx Ingress Controller
---

# NodePort、Loadbalancer和Ingress

Ingress 是实现K8s集群内南北流量管理的一种机制，除此之外还有Loadbalancer服务和NodePort服务两种方式。在使用上，NodePort服务最为简单，它通过在集群的节点上暴露一个端口，通过访问该端口可以直接访问对应的内部服务。下图是描述NodePort服务的一个样例，内部服务通过宿主机上的30123端口进行暴露，流量到达该端口后会被进一步转发给集群内的服务，最后转给对应的Pod：

![service-nodeport](/assets/nginx-ingress-controller/service-nodeport.png)

图中的“服务”像反向代理一样工作，但它却不是真实存在的一个计算实体。当流量到达NodePort端口（图中为端口30123）时，会被该节点上的iptables规则进一步转发。如果该节点上刚好存在服务对应的Pod，那么可能会转发给该Pod，也有可能进行流量负载均衡转给其他的Pod；如果该节点上不存在服务对应的Pod，那么直接转给其他节点上的Pod。这个流量转发过程就是“服务”的工作机制。

NodePort服务有个比较大的问题：外部需要知道集群的所有节点IP和对应的NodePort端口，然后发起调用。虽然外部可以直接调其中一个节点的IP，但这样该节点的进出流量可能会占满网络带宽。另外，Kubernetes集群本身是高度可伸缩的，每一个节点都可能会被释放，也有可能会新增节点。因此，在生产环境通常会使用Loadbalancer服务或者Ingress。

Loadbalancer服务在NodePort服务基础之上增加了一个外部的负载均衡器。这个负载均衡器负责提供统一的IP和端口，流量到达该负载均衡器之后会被进一步转发给节点上的端口，后续转发流程和NodePort服务一样。

![loadbalancer](/assets/nginx-ingress-controller/loadbalancer.png)

负载均衡器的IP和端口是基本固定的，如果集群节点进行伸缩，只需要更新节点信息到负载均衡器，外部调用端不需要做任何变更。但这种服务拓扑还存在一个问题：每个服务都需要通过负载均衡器对外暴露端口。这里假定负载均衡器是可以复用的，如果不能复用那问题更糟糕，每个服务都需要单独一个负载均衡器对外暴露服务。例如，你们有zoo、doo、foo三个服务，它们的访问路径不同，但如果使用Loadbalancer来对外提供服务，那么外界看来这三个服务调用的IP或端口都是不同的，如下所示：

![loadbalancer-problem](/assets/nginx-ingress-controller/loadbalancer-problem.png)


这会给客户端带来很多麻烦。在这种情况下，我们可以使用Ingress来解决入口统一的问题，它看起来是这样的：

![ingress](/assets/nginx-ingress-controller/ingress.png)

Ingress跟Loadbalancer最大的不同是，Ingress对外提供了统一的访问入口，然后内部再进行流量分发，而Loadbalancer只是作为后端服务节点的负载均衡，不提供上层业务的流量分发能力。Ingress通常工作在七层（HTTP/HTTPS），提供API网关的功能，而Loadbalancer更多适用于四层（TCP）流量转发。图中Ingress是一个笼统的概念实体，K8s本身不提供Ingress底层的具体实现，需要通过社区或商业化的Ingress组件来提供能力。下面以最为流行的[Nginx Ingress Controller](https://github.com/kubernetes/ingress-nginx)来进一步说明。

# Nginx Ingress Controller整体结构

Nginx Ingress Controller的整体架构是这样的：

![pattern](/assets/nginx-ingress-controller/pattern.png)

先来看数据流。Nginx Ingress Controller本身是通过Loadbalancer（负载均衡）来对外提供服务，这个Loadbalancer是工作在四层（TCP或UDP）的。客户端发出的流量先经过负载均衡器到达集群节点端口，然后通过service转发，到达Nginx Ingress Controller这个Pod节点。Nginx Ingress Controller中包含了一个Nginx进程，负责进行七层的流量分发，转发给最终的Pod。整体来看，相对于上面的Loadbalancer服务来说，Ingress机制引入了一个单独的Ingress Controller组件，这个组件负责统一接收流量，提供API网关的能力，并完成流量的七层转发。

再来看控制流。图中Nginx Ingress Controller通过 Ingress -> Service -> Endpoints 这个资源引用链路来获取到目标Pod，然后进行流量转发。Ingress、Service和Endpoints是K8s中的资源定义，下面来一一说明。 Ingress指的是K8s中类型为[Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)的资源定义，它看起来类似于这样的：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minimal-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx-example
  rules:
  - http:
      paths:
      - path: /testpath
        pathType: Prefix
        backend:
          service:
            name: test
            port:
              number: 80
```


图中kind为Ingress表明了这是一个Ingress资源定义，spec中ingressClassName为nginx-example表明了Ingress Controller的类型（截图中为nginx-example，这只是一个样例，实际上应该是nginx）。另外spec中的rules定义了转发规则，上面的转发规则为：所有前缀为/testpath的流量都转发给服务名称为test且目标端口为80的节点。最后，metadata中的annotations定义了nginx ingress的流量rewrite规则，在转发之后去除/testpath，变成了/，也就是后端服务接收到的请求路径将是/。

Service也就是K8s里的服务，除了上面说的NodePort和Loadbalancer两种类型服务之外，集群内部普遍使用ClusterIp类型的服务。ClusterIp类型服务会被分配集群内部唯一的IP且保持不变，集群内部工作负载（例如Pod）可以通过服务名称或者IP来访问该服务。最简单的Service资源定义例如：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app.kubernetes.io/name: MyApp
  ports:
    - protocol: TCP
      port: 80
      targetPort: 9376
```

这里定义了一个名为my-service的服务资源定义，将其端口80的流量转发到带有app.kubernetes.io/name=MyApp标签的Pod的9376端口。每个Service都对应于一个Endpoints，且名称相同。K8s会将Service的目标Pod地址信息更新到Endpoints中。

综上所述，Nginx Ingress Controller通过Ingress来匹配当前流量找到对应的Service，然后根据Service所对应的Endpoints找到对应的Pod，最终完成流量转发。

# Nginx Ingress Controller的安装

Nginx Ingress Controller支持多种安装方式，但一般常用的是直接使用Manifests文件（也就是Yaml文件）和Helm这两种方式来安装。如果你采用Helm来安装，那么集群中不应该存在任何Nginx Ingress Controller相关资源（比如存在老版本的资源），否则会导致冲突而失败。而通过Manifests文件来安装则需要注意集群版本和Nginx Ingress Controller版本是否兼容。

你可参考kubernetes社区的[Nginx Ingress Controller安装指南](https://kubernetes.github.io/ingress-nginx/deploy/)，或者Nginx社区的[安装指南](https://docs.nginx.com/nginx-ingress-controller/installation/installation-with-manifests/)来安装。Kubernetes社区的安装指南简练一些，例如通过Manifest安装1.4.0版本的Nginx Ingress Controller，只需要执行下面一行命令：

```
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.4.0/deploy/static/provider/cloud/deploy.yaml
```

如果你关心里面的具体细节，那么建议通过Nginx社区的安装指南来安装，里面详细得多。

# Nginx Ingress Controller的配置

整体上我们可以通过ConfigMap或者Annotation两种方式来配置Nginx Ingress Controller的行为。ConfigMap方式是全局的，一旦配置了集群里的Nginx Ingress都会生效；Annotation方式是局部的，你可以单独配置某个Ingress的Annotation来指明Nginx Controller的行为，这样不影响其他的Nginx Ingress。通过ConfigMap配置的方式如下所示：

```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  name: nginx-config
  namespace: nginx-ingress
data:
  proxy-connect-timeout: "10s"
  proxy-read-timeout: "10s"
  client-max-body-size: "2m"
```

这个ConfigMap位于nginx-ingress命名空间，名称为nginx-config。截图中配置了三个配置项，分别是：

* proxy-connect-timeout：nginx连接后端服务器的超时时间，不超过10秒。
* proxy-read-timeout：nginx读取后端响应的超时时间，不超过10秒。
* client-max-body-size：client端最大的body大小，不超过2m。

你可参考[configmap-resource文档](https://docs.nginx.com/nginx-ingress-controller/configuration/global-configuration/configmap-resource/)定义更多配置项。

# Nginx Ingress

来看一个Nginx社区的Ingress样例，如下所示：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cafe-ingress
spec:
  tls:
  - hosts:
    - cafe.example.com
    secretName: cafe-secret
  rules:
  - host: cafe.example.com
    http:
      paths:
      - path: /tea
        pathType: Prefix
        backend:
          service:
            name: tea-svc
            port:
              number: 80
      - path: /coffee
        pathType: Prefix
        backend:
          service:
            name: coffee-svc
            port:
              number: 80
```

其中各项配置说明如下：

* **metadata.name**为此Ingress资源的名称，**cafe‑ingress** ；
* **spec.tls**字段定义了SSL/TLS配置：
  * **secretName**为引用的K8s secret名称，也就是**cafe‑secret**。这个secret需要包含SSL/TLS的证书和私钥，对应的键值分别为tls.crt和tls.key。
  * **hosts**部分指明了SSL/TLS的域名。
* **spec.rules**部分定义了一个域，**cafe.example.com**。
* **paths**部分定义了两个基于路径的转发规则：
  * 将**/tea**开头的请求转发给集群里的**tea-svc**服务；
  * 将**/coffee**开头的请求转发给集群里的**coffee-svc**服务；

# VirtualServer 和 VirtualServerRoute Resources

Nginx社区推荐使用VirtualServer和VirtualServerRoute来代替Ingress，因为它们比Ingress能提供更多的特性支持，例如流量切分和更高级的基于请求内容的路由等等。VirtualServer和VirtualServerRoute本质是一个K8s的[Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)。你可参考[VirtualServer and VirtualServerRoute Resources](https://docs.nginx.com/nginx-ingress-controller/configuration/virtualserver-and-virtualserverroute-resources/)文档来了解关于它们的更多信息，同时也可以通过这些[样例工程](https://github.com/nginxinc/kubernetes-ingress/tree/v2.4.1/examples/custom-resources)来参考更多实践。

