"""别名守卫（philo_rag/lexicon.py）：单字整词命中 + 复合词排除 + 长别名优先。

守卫是「注解精度」的第一道闸门：不改的话，「道德」里的「道」、「事物」里的「物」
都会被写进块注解，再经索引扩散到检索与引用卡片。这里用合成词典把规则钉死。
"""
from __future__ import annotations

from pathlib import Path

import yaml

from philo_rag.lexicon import Lexicon


def _mini_lex(tmp_path: Path, concepts: list[dict]) -> Lexicon:
    phil = tmp_path / "philosophers.yaml"
    conc = tmp_path / "concepts.yaml"
    phil.write_text("philosophers: []\n", encoding="utf-8")
    conc.write_text(
        yaml.safe_dump({"concepts": concepts}, allow_unicode=True), encoding="utf-8"
    )
    return Lexicon(phil, conc)


def test_single_char_alias_requires_standalone_token(tmp_path):
    lex = _mini_lex(tmp_path, [{"name": "虚无", "aliases": ["无"], "definition": "x"}])
    assert lex.match_concepts("他无法解释这个现象") == []
    assert lex.match_concepts("这种「无」是不可填充的") == ["虚无"]


def test_guard_compounds_block_known_false_positive(tmp_path):
    lex = _mini_lex(tmp_path, [
        {"name": "德性", "aliases": ["美德"], "guard": {"compounds": ["道德性"]}, "definition": "x"},
    ])
    assert lex.match_concepts("这首先是道德性问题") == []
    assert lex.match_concepts("德性处于过度与不足之间") == ["德性"]


def test_guard_token_can_extend_word_boundary_to_longer_alias(tmp_path):
    lex = _mini_lex(tmp_path, [
        {"name": "量子", "aliases": ["量子"], "guard": {"token": ["量子"]}, "definition": "x"},
    ])
    assert lex.match_concepts("量子力学是物理学") == []          # 「量子力学」切分后是一个词
    assert lex.match_concepts("量子是离散的最小单位") == ["量子"]


def test_longest_alias_wins_without_single_char_noise(tmp_path):
    lex = _mini_lex(tmp_path, [
        {"name": "本体论", "aliases": ["存在论"], "definition": "x"},
        {"name": "实体", "aliases": ["本体"], "definition": "y"},
    ])
    # 「本体论」必须整体归给 本体论，不能被「本体」（实体）抢走
    assert lex.match_concepts("本体论规定存在者整体") == ["本体论"]
