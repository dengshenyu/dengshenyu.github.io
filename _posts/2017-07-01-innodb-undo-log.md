---
layout: post
title: "【译】InnoDB undo日志与历史系统基础"
keywords: "InnoDB, undo, mvcc"
description: "InnoDB undo日志与历史系统基础"
date: 2017-07-01 17:00
categories: "Mysql"
---


InnoDB实现了[多版本并发控制（MVCC）](https://en.wikipedia.org/wiki/Multiversion_concurrency_control)，意味着不同的用户可以看到不同版本的数据（有时候也会称作**快照**，但这种叫法有些误导性）。这样做是为了用户能够在不使用锁的情况下看到数据库一致性的视图，因为锁极其影响性能和并发。InnoDB的undo日志和“历史”系统是MVCC的实现基础。

## InnoDB保留数据更改的历史副本

InnoDB实现MVCC最关键的一点是，当一条记录被修改时，当前的老版本数据会作为一条**undo记录**保存在**undo日志**中。之所以叫做undo日志，是因为它包含了足够的信息来将记录恢复到之前的版本。

![undo-record](/assets/innodb-undo/undo-record.png)

每一条记录都包含一个指针指向它最近的undo记录，称作回滚指针（ROLL_PTR），并且每条undo记录包含一个指向前一个undo记录的指针（最初的插入undo记录除外），这就形成了一条包含所有历史版本的记录链。通过这种方法，任何历史版本的记录都可以被构造只要undo记录（也就是“历史”）仍然保存在undo日志中。

## 事务总是操作“实时”数据而非保存私有复制

任何的事务都是直接在数据库本身上做操作。所有事务的增删改都作用于同一个索引结构，虽然这些进行中的事务的数据可能对于其他事务来说不可见（取决于事务隔离级别），但事务的数据修改影响（特别是性能耗费）是实时可见的。

当读索引的时候，事务会使用一个“读视图”，它控制什么版本的记录可以被事务看见，因此任何最近修改的记录都会首先被恢复到一个足够老的版本（有时候甚至导致记录完全不可见）。

当一个事务更新一条记录但仍未提交时，其他使用隔离的事务会立即受到影响，因为这些事务需要在每次读记录时都需要将索引上记录的版本恢复到一个更早的版本（也就是他们能够允许看见的版本）。

## 事务隔离级别？

目前与undo日志、历史系统和多版本有关的事务隔离级别有三种：

* 读未提交（READ UNCOMMITTED）：也被叫做“脏读”，因为它总是使用索引中的最新数据而不考虑任何的事务隔离，可能会读到未提交（有可能被回滚）的数据。即便在一个语句中，事务的一致性也不能被保证，因为遍历记录时记录并不会被恢复到某一个历史版本（也就是每个记录的版本不一样）。
* 读提交（READ COMMITTED）：每个语句都会使用一个新的读视图，这个读视图基于在该语句开始时最大的提交事务ID。每个语句返回的记录集合是一致的（也就是每个记录的版本是一样的），但语句与语句之间的读视图是不一致的，用户可能会看到新数据。
* 可重复读（REPEATABLE READ）：这个是MySQL InnoDB的默认事务隔离级别。在事务开始时，一个读视图会被创建，这个读视图会被事务中的所有语句使用，这保证了在事务进行过程中始终看到的是同一个数据库视图。换句话说，事务中的数据是“可重复读”的。

（其实MySQL的InnoDB还支持另外一个事务隔离级别，串行（SERIALIZABLE），但它使用的是锁而非事务可见性）

通常在访问索引时，为了满足事务隔离的需要，少量的记录需要被恢复到之前的某个版本。这会有一定的性能损失，但只要一个事务的读视图是比较新的，那么大部分的记录都不需要恢复到历史版本，这种情况下性能损失非常有限。

## 长事务和慢查询

在MySQL实践中，运行时间长的事务通常被认为是不好的。为什么？主要有两大原因：

* 非常老的读视图。一个长事务（特别是可重复读的事务）会使用一个老的读视图，在写操作非常频繁的数据库中这需要将非常多的行恢复到非常老的版本。这会使得该事务本身运行很慢，在最坏情况下可能该事务的查询永远不会完成，因为查询慢导致产生更多历史记录，更多历史记录意味着更慢。
* 阻塞日志清理。因为长事务的读视图非常老，整个系统的undo日志清理会被阻塞，直到该事务完成。这会导致undo日志持续增长（而不是正常情况下的空间复用），从而导致系统表空间（ibdata1）增长，由于其他限制，增长的表空间不会被释放。

如果的确需要一个长事务，那么可以考虑使用读未提交的隔离级别来避免以上问题。

## 删除并不真正删除

当一条记录被删除时，由于事务隔离，其他事务可能仍然需要看到这条记录存在。如果这条记录从索引上立即删除，那么其他事务将不可能找到这条记录，也就不可能通过这条记录的回滚指针找到更早的版本。（这里再提醒下多个事务可能看到同一记录的多个版本，五个事务可能看到五个不同版本）。因此，删除操作并不真正删除，它只是**标记**该记录删除。

## 全局历史以及清理操作

除了每条记录有一个指针指向它前一个版本之外，数据库也会保留整体视图的历史，叫做“历史链”。当每个事务提交时，事务的历史会按照事务提交的顺序被链接到这个全局历史链中。历史链主要被用来在事务完成后做清理操作。

在后台InnoDB会运行一个“清理”（purge）进程，它主要负责两件事情：

* 真正删除被标记删除的记录，只要在清理时索引中的记录版本仍然是标记删除的，并且和清理进程的事务ID相同。
* 回收undo日志页并且将他们从全局历史链中移除，以后续复用。

在InnoDB中，我们可以通过“SHOW ENGINE INNODB STATUS”的“History list length”来看系统中当前的历史使用量。这个是undo日志中所有数据库改动的统计，以**undo日志单元**为单位（可能包括一个或多个记录改动）。


> 原文地址[The basics of the InnoDB undo logging and history system](https://blog.jcole.us/2014/04/16/the-basics-of-the-innodb-undo-logging-and-history-system/)
