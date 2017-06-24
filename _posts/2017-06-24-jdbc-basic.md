---
layout: post
title: "谈谈JDBC"
keywords: "Java, JDBC"
description: "JDBC基础知识"
date: 2017-06-24 16:00
categories: "Java"
---

JDBC是Java Database Connectivity的简称，它定义了一套访问数据库的规范和接口。但它自身不参与数据库访问的实现。因此对于目前存在的数据库（譬如Mysql、Oracle）来说，要么数据库制造商本身提供这些规范与接口的实现，要么社区提供这些实现。

对于Mysql数据库来说，我们通常使用如下包来访问数据库：

{% highlight xml %}

<dependency>
    <groupId>mysql</groupId>
    <artifactId>mysql-connector-java</artifactId>
    <version>5.1.39</version>
</dependency>

{% endhighlight %}

JDBC的类包含在[java.sql](https://docs.oracle.com/javase/8/docs/api/java/sql/package-summary.html)和[javax.sql](https://docs.oracle.com/javase/8/docs/api/javax/sql/package-summary.html)。这里岔开一句，javax是sun公司提供的一个扩展包，提供原java包的一些扩展处理，随着时间发展，javax在很多处理上已经成为java核心架构的一部分，譬如javax的swing包。

在对数据库进行操作时，我们需要先获取一个连接，如下：


{% highlight java %}

Connection conn = DriverManager.getConnection("jdbc:somejdbcvendor:other data needed by some jdbc vendor", "myLogin", "myPassword");

try {
    //使用连接访问数据库
} finally {
    try {
        //关闭连接
        conn.close();
    } catch (Throwable t) {
        //关闭连接失败, 失败处理
        logger.warn("关闭数据库连接失败",e);
    }
}

{% endhighlight %}

对于Mysql数据库来说，获取连接格式如下：


{% highlight java %}

Connection conn = DriverManager.getConnection("jdbc:mysql://localhost:3306/test", "myLogin", "myPassword");

{% endhighlight %}

DriverManager是JDBC提供的驱动管理类，它负责根据参数中的连接url查找合适的驱动。对于诸如“jdbc:mysql:”这样的连接查找Mysql驱动，对于“jdbc:oracle:”这样的连接查找Oracle驱动。DriverManager.getConnection的核心逻辑如下：


{% highlight java %}

for(DriverInfo aDriver : registeredDrivers) {
    // 检查调用DriverManager.getConnection的代码是否有权限加载驱动
    if(isDriverAllowed(aDriver.driver, callerCL)) {
        try {
            println("    trying " + aDriver.driver.getClass().getName());
            Connection con = aDriver.driver.connect(url, info);
            if (con != null) {
                // 获取成功
                println("getConnection returning " + aDriver.driver.getClass().getName());
                return (con);
            }
        } catch (SQLException ex) {
            if (reason == null) {
                reason = ex;
            }
        }

    } else {
        println("    skipping: " + aDriver.getClass().getName());
    }

}

//如果没有合适的驱动，则抛出异常
if (reason != null)    {
    println("getConnection failed: " + reason);
    throw reason;
}

println("getConnection: no suitable driver found for "+ url);
throw new SQLException("No suitable driver found for "+ url, "08001");

{% endhighlight %}

可以看到，DriverManager只是遍历它的驱动列表registeredDrivers，检查每个驱动是否能处理该url，如果能处理则返回连接，否则检查完所有的驱动都没找到合适驱动则抛出异常。

而registeredDrivers被定义为静态变量：

{% highlight java %}

private final static CopyOnWriteArrayList<DriverInfo> registeredDrivers = new CopyOnWriteArrayList<>();

{% endhighlight %}

每个数据库驱动在加载的时候会调用DriverManager.registerDriver方法来将自身注册在DriverManager的registeredDrivers中。mysql-connector-java的驱动注册代码如下：


{% highlight java %}

package com.mysql.jdbc;

import java.sql.SQLException;

public class Driver extends NonRegisteringDriver implements java.sql.Driver {
//
// Register ourselves with the DriverManager
//
static {
    try {
        java.sql.DriverManager.registerDriver(new Driver());
    } catch (SQLException E) {
        throw new RuntimeException("Can't register driver!");
    }
}

/*
 * Construct a new driver and register it with DriverManager
 * 
 * @throws SQLException
 *             if a database error occurs.
 */
public Driver() throws SQLException {
    // Required for Class.forName().newInstance()
}
}

{% endhighlight %}

通过DriverManager.getConnection获取到连接后，我们通过创建和执行Statement来对数据库进行增删改查。JDBC有如下三种Statement：

* [Statement](https://docs.oracle.com/javase/8/docs/api/java/sql/Statement.html)：这个Statement在执行时每次都会发送到数据库解析、执行。
* [PreparedStatement](https://docs.oracle.com/javase/8/docs/api/java/sql/PreparedStatement.html)：这个Statement在创建时被发送到数据库server进行预解析并在本地缓存数据库解析结果，每次执行时不需要重新解析以节省时间。
* [CallableStatement](https://docs.oracle.com/javase/8/docs/api/java/sql/CallableStatement.html)：这个Statement用来执行数据库的存储过程（stored procedure）。

下面分析下mysql-connect-java包的PreparedStatement创建过程。当我们调用conn.prepareStatement()方法时，它的核心逻辑如下：

{% highlight java %}

public java.sql.PreparedStatement prepareStatement(String sql, int resultSetType, int resultSetConcurrency) throws SQLException {
    //获取连接互斥锁
    synchronized (getConnectionMutex()) {
        //检查连接是否关闭
        checkClosed();

        PreparedStatement pStmt = null;

        boolean canServerPrepare = true;

        //根据需要本地化sql语句
        String nativeSql = getProcessEscapeCodesForPrepStmts() ? nativeSQL(sql) : sql;

        //判断数据库服务器是否支持sql预处理
        if (this.useServerPreparedStmts && getEmulateUnsupportedPstmts()) {
            canServerPrepare = canHandleAsServerPreparedStatement(nativeSql);
        }

        if (this.useServerPreparedStmts && canServerPrepare) {
            //检查连接是否启用PreparedStatement的缓存，启用则先在缓存中查找该sql对应的PreparedStatement，在缓存中找不到或者缓存没启用都会创建新的PreparedStatement
            if (this.getCachePreparedStatements()) {
                synchronized (this.serverSideStatementCache) {
                    pStmt = (com.mysql.jdbc.ServerPreparedStatement) this.serverSideStatementCache.remove(sql);

                    //在本地缓存中找到对应的PreparedStatement，则把它从缓存中移除，以便在本次调用中使用
                    if (pStmt != null) {
                        ((com.mysql.jdbc.ServerPreparedStatement) pStmt).setClosed(false);
                        pStmt.clearParameters();
                    }

                    //在本地缓存中找不到对应的PreparedStatement，创建新的PreparedStatement
                    if (pStmt == null) {
                        try {
                            //创建新的PreparedStatement，会在ServerPreparedStatement.getInstance中会发送语句到数据库服务器进行预处理
                            pStmt = ServerPreparedStatement.getInstance(getMultiHostSafeProxy(), nativeSql, this.database, resultSetType,
                                    resultSetConcurrency);
                            if (sql.length() < getPreparedStatementCacheSqlLimit()) {
                                ((com.mysql.jdbc.ServerPreparedStatement) pStmt).isCached = true;
                            }

                            pStmt.setResultSetType(resultSetType);
                            pStmt.setResultSetConcurrency(resultSetConcurrency);
                        } catch (SQLException sqlEx) {
                            if (getEmulateUnsupportedPstmts()) {
                                pStmt = (PreparedStatement) clientPrepareStatement(nativeSql, resultSetType, resultSetConcurrency, false);

                                if (sql.length() < getPreparedStatementCacheSqlLimit()) {
                                    this.serverSideStatementCheckCache.put(sql, Boolean.FALSE);
                                }
                            } else {
                                throw sqlEx;
                            }
                        }
                    }
                }
            } else {
                //不启用本地缓存，直接发送语句到数据库服务器预处理并创建新的PreparedStatement，
                try {
                    pStmt = ServerPreparedStatement.getInstance(getMultiHostSafeProxy(), nativeSql, this.database, resultSetType, resultSetConcurrency);

                    pStmt.setResultSetType(resultSetType);
                    pStmt.setResultSetConcurrency(resultSetConcurrency);
                } catch (SQLException sqlEx) {
                    // Punt, if necessary
                    if (getEmulateUnsupportedPstmts()) {
                        pStmt = (PreparedStatement) clientPrepareStatement(nativeSql, resultSetType, resultSetConcurrency, false);
                    } else {
                        throw sqlEx;
                    }
                }
            }
        } else {
            //数据库不支持语句预处理，则在本地创建一个client类型的PreparedStatement，使得方法调用者不用关心数据库预处理支持程度
            pStmt = (PreparedStatement) clientPrepareStatement(nativeSql, resultSetType, resultSetConcurrency, false);
        }

        return pStmt;
    }
}

{% endhighlight %}

上面代码中已加了注释，希望能够帮助大家理解。可以看到，如果启用了本地缓存，那么先会在本地缓存中查找sql对应的已经预处理过的PreparedStatement，如果找到则复用此PreparedStatement。

Statement（包括PreparedStatement）使用完之后，需要调用close方法。对于PreparedStatement，如果经过数据库预处理的并且启用了本地缓存，那么会在close方法中写进缓存中，使得此连接的后续sql执行可以复用同样的预处理。

{% highlight java %}

public void close() throws SQLException {
    MySQLConnection locallyScopedConn = this.connection;

    if (locallyScopedConn == null) {
        return; // already closed
    }

    synchronized (locallyScopedConn.getConnectionMutex()) {

        if (this.isCached && !this.isClosed) {
            clearParameters();

            this.isClosed = true;

            this.connection.recachePreparedStatement(this);
            return;
        }

        realClose(true, true);
    }
}

{% endhighlight %}

使用JDBC的Connection、Statement访问Mysql数据库的完整例子如下：

{% highlight java %}

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;

/*
 * Created by shenyuan on 2017/6/24.
 */
public class MysqlTest {
    public static void main(String[] args) {
        Connection conn = null;
        Statement stmt = null;

        try {
            conn = DriverManager.getConnection("jdbc:mysql://localhost:3306/test", "myLogin", "myPassword");
            stmt = conn.createStatement();
            String sql = "INSERT INTO test VALUES ('dengshenyu','java')";
            stmt.executeUpdate(sql);

        } catch (Exception ex) {
            ex.printStackTrace();
        } finally {
            try {
                if (stmt != null)
                    stmt.close();
                if (conn != null)
                    conn.close();
            } catch (Exception e) {
                e.printStackTrace();
            }
            
        }

    }
}


{% endhighlight %}


