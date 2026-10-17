"""会话存储（philo_rag/conv.py）：TTL / 容量 / 并发三条约束。

会话是「运行期状态」不是长期记录（temp.md D1/D5）：过期与淘汰都只造成追问降级，
不会丢用户数据，因此这里的断言全部落在边界行为上。
"""
from __future__ import annotations

import threading
import time

from philo_rag.conv import (
    ConversationStore,
    Turn,
    make_digest,
    prior_block,
    settings,
    with_prior,
)


def _turn(i: int) -> Turn:
    return Turn(question=f"问题{i}", standalone=f"问题{i}", strategy="point")


def test_get_none_or_unknown_returns_empty():
    store = ConversationStore()
    assert store.get(None) == []
    assert store.get("") == []
    assert store.get("不存在的会话") == []


def test_ttl_expiry_drops_turns():
    store = ConversationStore(ttl_sec=0.05)
    cid = store.new_id()
    store.append(cid, _turn(1))
    assert len(store.get(cid)) == 1

    time.sleep(0.12)
    assert store.get(cid) == []
    # 过期条目不能留在表里继续占容量
    assert len(store) == 0


def test_append_keeps_only_latest_max_turns():
    store = ConversationStore(max_turns=3)
    cid = store.new_id()
    for i in range(5):
        store.append(cid, _turn(i))
    turns = store.get(cid)
    assert [t.standalone for t in turns] == ["问题2", "问题3", "问题4"]


def test_capacity_evicts_least_recently_used_conversation():
    store = ConversationStore(maxsize=2)
    first, second, third = "a", "b", "c"
    store.append(first, _turn(1))
    store.append(second, _turn(2))
    store.get(first)          # 让 a 成为最近使用，b 才是该被淘汰的那个
    store.append(third, _turn(3))
    assert store.get(third)
    assert store.get(first)
    assert store.get(second) == []


def test_concurrent_append_loses_no_turn():
    """20 线程并发追加：单锁必须让「读当前列表 + 写回」不被交错。"""
    store = ConversationStore(max_turns=100)
    cid = store.new_id()
    barrier = threading.Barrier(20)

    def worker(i: int) -> None:
        barrier.wait()
        store.append(cid, _turn(i))

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(20)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()

    turns = store.get(cid)
    assert len(turns) == 20
    assert {t.standalone for t in turns} == {f"问题{i}" for i in range(20)}


def test_returned_list_is_a_copy():
    """调用方拿到的是副本：就地改成轮次不会污染会话（改写只读）。"""
    store = ConversationStore()
    cid = store.new_id()
    store.append(cid, _turn(1))
    store.get(cid).clear()
    assert len(store.get(cid)) == 1


def test_settings_fills_defaults_and_honours_config():
    assert settings({}) == {
        "enabled": True,
        "ttl_sec": 1800,
        "max_turns": 4,
        "digest_chars": 300,
        "max_conversations": 64,
    }
    conf = {"conversation": {"enabled": False, "ttl_sec": 60, "max_turns": 2}}
    got = settings(conf)
    assert got["enabled"] is False
    assert got["ttl_sec"] == 60 and got["max_turns"] == 2
    assert got["digest_chars"] == 300 and got["max_conversations"] == 64


def test_digest_point_strips_citation_marks_and_truncates():
    result = {"strategy": "point", "answer": "字头是[1]坐标系中的一格。[2]" + "多" * 50}
    digest = make_digest(result, chars=20)
    assert "[1]" not in digest and "[2]" not in digest
    assert digest.startswith("字头是坐标系中的一格。")
    assert len(digest) == 20


def test_digest_theme_uses_structured_fields_not_body():
    """范围查询的正文开头是套话（R14）：摘要必须来自 theme 的结构化字段。"""
    result = {
        "strategy": "theme",
        "answer": "这里是四千字的正文，不该进摘要。",
        "theme": {
            "counts": {"direct": 42},
            "units": [
                {"code": "3-2-1", "title": "精神分析", "volume": "第三卷"},
                {"code": "3-2-2", "title": "拉康", "volume": "第三卷"},
            ],
            "lineage": [["黑格尔", 12], ["康德", 9]],
        },
    }
    digest = make_digest(result, chars=300)
    assert "3-2-1 精神分析" in digest
    assert "黑格尔" in digest and "康德" in digest
    assert "42" in digest
    assert "四千字" not in digest
    assert len(digest) <= 300


def test_prior_block_shape_and_empty_case():
    """上文前置块的形态固定：没有摘要与侧重时返回空串（不污染首问的 context）。"""
    assert prior_block("", "") == ""
    block = prior_block("大他者是象征界的能指", "把上文的论点讲细")
    assert block.splitlines() == [
        "【上一轮已答要点，本轮请勿重复，只做增量】",
        "大他者是象征界的能指",
        "【本轮侧重】把上文的论点讲细",
    ]
    assert with_prior("", "原文") == "原文"
    assert with_prior("[前]", "原文") == "[前]\n\n原文"
