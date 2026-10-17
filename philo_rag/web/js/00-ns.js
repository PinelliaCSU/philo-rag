/* 00-ns.js · 常量与配置：分页条数、阅读字号、本地存储键、词表与查询方式文案（纯数据，无副作用） */
'use strict';
window.PHILO = window.PHILO || {};

/* ---------- 分页与滚动 ---------- */
const CITE_PER_PAGE = 1;   // 引用来源：逐条浏览
const LIST_PER_PAGE = 4;   // 检索结果：每页 4 条
const UNIT_PER_PAGE = 6;
/* 流式追加时按帧合并渲染：delta 每秒可上百个，逐个重排会明显卡顿。
   若容器已被 renderAnswer() 换掉（done 时重渲染），这一帧自动作废。 */
const ANSWER_BOTTOM_THRESHOLD = 24;

/* ---------- 连续阅读 ---------- */
const READ_FONT_MIN = 14;
const READ_FONT_MAX = 26;

/* ---------- 本地存储键与历史裁剪水位 ---------- */
const NOTES_KEY = 'philo-notes-v1';
const ANS_KEY = 'philo-answers-v1';
const READ_POS_KEY = 'philo-read-pos';
const MAX_HISTORY = 120;
const ANS_HARD_MAX = 3000000;   // 超过即裁剪
const ANS_SOFT_MAX = 2000000;   // 裁到这条水位以下

/* ---------- 视图与面板词表 ---------- */
const PANEL_TITLES = {
  concept: '概念卡', search: '术语 / 引文检索', map: '体系地图',
  notes: '笔记与书签', history: '问答历史', compare: '概念对比',
};
const HEAD_NAMES = { '1': '形而下学', '2': '形而上学', '3': '观念论', '4': '实践' };
const LAYER_NAMES = ['场域论', '本体论', '认识论', '目的论'];
const CONV_CHIPS_MAX = 6;

/* ---------- 提问方式 ---------- */
const STRATEGY = {
  auto: {
    scope: '不指定——由系统按你的措辞自动在下面两种之间选择。',
    egs: ['什么是字头？', '马克思在体系中的位置', '谈谈精神分析'],
  },
  point: {
    scope: '定位式提问：问一个概念 / 术语<b>是什么、出自哪里</b>。召回 8 条最相关的块，回答数百字，每条论断可回跳原文。',
    egs: ['什么是字头？', '大他者是什么意思？', '3-2 讲什么？'],
  },
  theme: {
    scope: '主题式提问：问一个主题<b>在全书中的面貌、脉络与谱系</b>。召回数百块并按数值单元聚合，回答数千字、按体系结构分节。',
    egs: ['马克思在体系中的位置', '谈谈精神分析', '黑格尔的思想脉络'],
  },
};

/* ---------- 检索方式 ---------- */
const SEARCH = {
  term: {
    scope: '问「某个术语 / 概念<b>是什么、在哪儿出现</b>」：先给词典卡（归属、别名、定义），再用语义检索补充相关段落。',
    placeholder: '例如：大他者 / 客体小a / 场域论 / 存在者整体',
    button: '检索术语',
  },
  quote: {
    scope: '问「<b>谁说过什么原话</b>、某个单元里有哪些引文」：按理论家 / 说话人 / 概念 / 单元精确过滤引文块，结果可枚举、可核对，不做向量近似。',
    button: '检索引文',
  },
};
