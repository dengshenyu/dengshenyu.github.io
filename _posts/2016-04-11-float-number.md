---
layout: post
title: "谈谈浮点数"
keywords: Float,浮点数,Java
description: "谈谈浮点数"
date: 2016-04-11 11:52
categories: Computer_Science
---

之前看了Ruby创造者写的[松本行弘的程序世界](https://book.douban.com/subject/6756090/)，一直懒得整理。现在对里面的一些知识做下记录，同时希望能帮助到大家。

在看这本书之前，我只模糊的知道浮点数是会丢失精度的，浮点数的比较不能直接用等号这些，但具体的原因并不是十分清楚。

现在我们来运行个Java程序：

{% highlight java %}
    public static void main(String[] args) {
        double a = 0;
        for (int i = 0; i < 10; i++) {
            a += 0.1;
        }
        System.out.println(a);
    }
{% endhighlight %}

输出的结果是什么呢？


答案是 0.9999999999999999 。可是为什么呢？为什么10个0.1相加不等于1呢？

在回答这个问题之前，我们需要知道计算机是怎么表示双精度的。

《程序世界》里说到，双精度浮点数占用64位，采用IEEE754规范表示的话，比特串如下图所示：

![float-number-bits](/assets/float-number/float_num_bits.png)

f为尾数部分，e为指数部分。指数部分有11位，而这11位可以表示+1023 ~ -1024。尾数部分有52位，IEEE754规定，尾数部分的首位始终归一化为1，因此首位可以省略不存储，实质有效数字为53位。所谓归一化，就是将尾数部分变成大于等于1而小于2的数。举个栗子，48可以用3乘以2的4次方表示，归一化后变成1.5乘以2的5次方。

如果是这样的话，那浮点数的零怎么表示呢？既然尾数已经归一化为1，那么浮点数的零只能用1.0乘以2的-1024次方表示了，而-1024次方代表指数部分应该为0x400。

我尝试用下面的代码验证我的猜想（Java中的浮点数遵循IEEE754规范）：

{% highlight java %}
    public static void main(String[] args) {
        double zero = 0;
        long mask = 0x8000000000000000L;
        long bits = Double.doubleToLongBits(zero);
        for (int i = 63; i >= 0; i--) {
            System.out.print((bits >> i) & 1);
        }
    }

{% endhighlight %}

屏幕上显示了64个零。。。不对啊，说好的指数部分为0x400呢？指数部分最高位1去哪了？

带着疑问我查阅了[wikipedia](https://en.wikipedia.org/wiki/Double-precision_floating-point_format)，对于指数部分，我发现一个细节：

![float num exponent](/assets/float-number/float_num_exponent.png)

即，双精度浮点数的指数部分采用了二进制偏移，偏移值为1023。也就是说，指数部分为1其实代表的是（1 - 1023）=  -1022次方，指数部分为50代表的是（50 - 1023）= -973次方。

另外，指数部分的字节最小值0x000及最大值0x7ff有特殊含义：

* 对于指数字节值为0x000，如果尾数部分为0则此浮点数表示带符号零，否则为subnormal。subnormal指非常接近零已经超出浮点数表示范围的数。
* 对于指数字节值为0x7ff，如果尾数部分为0则表示无穷大（或无穷小），否则为NaN。NaN表示undefined的值，例如0除以0。

因此我们上面看到，Java中double赋值为零时内部表示为64个0。

最后我们再回过头看最初的问题：为什么10个浮点数0.1相加结果为0.9999999999999999呢？

因为十进制的0.1用二进制表示会变成0.0001100110011001100...这种循环小数，而浮点数的尾数部分是有限的，只能在有效数字的范围内进行舍入，因此10次相加误差累积起来，最后结果变成了0.9999999999999999。


