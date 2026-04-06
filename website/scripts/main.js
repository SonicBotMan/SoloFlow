(function () {
  'use strict';

  var nav = document.getElementById('nav');
  var navToggle = document.getElementById('navToggle');
  var mobileMenu = document.getElementById('mobileMenu');
  var canvas = document.getElementById('curveCanvas');
  var ctx = canvas ? canvas.getContext('2d') : null;

  var translations = {
    en: {
      a11y: {
        skip: 'Skip to content'
      },
      nav: {
        features: 'Features',
        architecture: 'Architecture',
        memory: 'Memory',
        lobster: 'lobster-press',
        comparison: 'Comparison',
        getStarted: 'Get Started'
      },
      hero: {
        badge: 'AI Workflow Orchestration',
        title: 'The <span class="gradient-text">Brain</span> Behind<br>Intelligent Workflows',
        subtitle: 'Turn chaotic multi-step AI tasks into structured, observable,<br class="hide-mobile"> retryable workflows — with cognitive memory and discipline-aware routing.',
        viewGithub: 'View on GitHub',
        getStarted: 'Get Started',
        learnMore: 'Learn More',
        stats: {
          tests: 'Tests Passing',
          modules: 'Modules',
          bundle: 'Bundle Size',
          mcpTools: 'MCP Tools',
          deps: 'Runtime Deps'
        }
      },
      problem: {
        tag: 'The Problem',
        title: 'Why existing solutions <span class="gradient-text">fail</span>',
        desc: 'Existing tools force you to choose between flexibility and reliability. You get either spaghetti prompt chains or rigid pipelines that break at scale.',
        solution: 'SoloFlow solves all of this',
        items: {
          chaos: { title: 'Chaotic Execution', desc: 'AI agents drift unpredictably without structured workflows or retry logic.' },
          memory: { title: 'Memory Blindspots', desc: 'No unified memory system — each step forgets context from the last.' },
          routing: { title: 'Blind Routing', desc: 'Tasks get routed blindly without matching to specialized agent capabilities.' },
          evolution: { title: 'Repetition Trap', desc: 'Teams repeatedly solve the same sub-problems instead of auto-evolving reusable skills.' }
        }
      },
      features: {
        tag: 'Core Features',
        title: 'Everything you need for <span class="gradient-text">production</span> AI',
        desc: 'Four pillars that make SoloFlow the most advanced open-source AI orchestration engine.',
        memory: { title: 'Cognitive Memory', desc: 'Three-tier memory system (Working/Episodic/Semantic) with Ebbinghaus forgetting curve: R(t) = base × e^(-t/stability). Automatic memory consolidation after each run.' },
        routing: { title: 'Discipline-Aware Routing', desc: 'Automatic task routing to specialized agents: quick for simple tasks, deep for complex analysis, visual for UI generation, ultrabrain for hard logic.' },
        architecture: { title: 'DAG + FSM Hybrid', desc: 'Workflow graph expressiveness with state machine rigor. Parallel execution where possible, sequential where required. Automatic retry with exponential backoff.' },
        evolution: { title: 'Skill Auto-Evolution', desc: 'Repeated patterns are detected automatically and packaged into reusable skills. Your workflow improves itself over time.' }
      },
      architecture: {
        tag: 'Architecture',
        title: 'Built for <span class="gradient-text">reliability</span>',
        desc: 'Clean layered architecture with clear separation of concerns.',
        layers: {
          api: 'RPC API Layer',
          workflow: 'Workflow Engine',
          memory: 'Memory System',
          agent: 'Agent Pool',
          skills: 'Skills Registry'
        }
      },
      memory: {
        tag: 'Research Foundation',
        title: 'Grounded in <span class="gradient-text-alt">cognitive science</span>',
        desc: 'SoloFlow\'s memory system is modeled after human memory research, featuring the Ebbinghaus forgetting curve for realistic memory decay. Built on <a href="https://github.com/SonicBotMan/lobster-press" target="_blank" rel="noopener" style="color: var(--color-accent-green);">lobster-press</a> cognitive memory engine.',
        tiers: {
          working: { title: 'Working Memory', desc: 'Active task context. Holds 7±2 items in focus. Fast access, short-lived. Cleared after task completion.', badge: 'Volatile' },
          episodic: { title: 'Episodic Memory', desc: 'Time-stamped experiences from past runs. Enables "remember when" reasoning. Decays via Ebbinghaus curve with periodic consolidation.', badge: 'Decaying' },
          semantic: { title: 'Semantic Memory', desc: 'Persistent knowledge from repeated patterns. Consolidated facts that survive memory decay. Foundation for skill auto-evolution.', badge: 'Persistent' }
        },
        curve: 'Ebbinghaus Forgetting Curve'
      },
      lobsterPress: {
        tag: 'Underlying Engine',
        title: 'Powered by <span class="gradient-text">lobster-press</span>',
        desc: 'lobster-press is SoloFlow\'s cognitive memory engine, built on cognitive science with DAG lossless compression, adaptive forgetting curve, and semantic memory capabilities.',
        npm: 'NPM Package',
        stars: 'GitHub Stars',
        modules: 'Core Modules',
        moduleList: {
          cmv: { name: 'CMV Triple-Pass Lossless', desc: 'Three-verification mechanism ensures zero loss in memory compression' },
          chlr: { name: 'C-HLR+ Adaptive Forgetting', desc: 'Intelligently regulates memory decay based on Ebbinghaus curve' },
          focus: { name: 'Focus Active Compression', desc: 'Smart detection and triggering of memory compression timing' },
          r3mem: { name: 'R³Mem Reversible 3-Layer', desc: 'Working → Episodic → Semantic memory compression' },
          wmr: { name: 'WMR Tool Framework', desc: 'Modular tool registration and invocation framework' }
        },
        cta: 'Explore lobster-press',
        link: 'GitHub Repository'
      },
      comparison: {
        tag: 'Competitive Analysis',
        title: 'How we <span class="gradient-text">compare</span>',
        desc: 'A feature-by-feature comparison with the most popular AI orchestration tools.',
        features: {
          discipline: 'Discipline-Aware Routing',
          cognitive: 'Cognitive Memory System',
          evolution: 'Skill Auto-Evolution',
          dagFsm: 'DAG + FSM Hybrid',
          visual: 'Visual Builder',
          multiUser: 'Multi-user / RBAC',
          mcp: 'MCP Tool Interface',
          leanDeps: 'Lean runtime dependencies'
        }
      },
      metrics: {
        tests: { value: '175', label: 'TypeScript Tests', desc: 'All passing, strict mode' },
        modules: { value: '180+', label: 'Modules', desc: 'Clean, modular architecture' },
        bundle: { value: '0.27MB', label: 'Bundle Size', desc: 'Incredibly lightweight' },
        mcp: { value: '5', label: 'MCP Tools', desc: 'Exposed interface' },
        deps: { value: '3', label: 'Runtime Deps', desc: 'jose, yaml, better-sqlite3' },
        license: { value: 'MIT', label: 'License', desc: 'Fully open source' }
      },
      started: {
        tag: 'Quick Start',
        title: 'Up and running in <span class="gradient-text">seconds</span>',
        desc: 'Install SoloFlow, define your first workflow, and watch it orchestrate. It\'s that simple.',
        tabs: { install: 'Install', workflow: 'Create Workflow', run: 'Run & Monitor' },
        installCode: '# Clone SoloFlow into your OpenClaw plugins directory\ngit clone https://github.com/SonicBotMan/SoloFlow.git\ncd SoloFlow/openclaw-plugin\n\n# Install dependencies with Bun\nbun install\n\n# Build the plugin\nbun run build\n\n# Verify - 175 tests passing ✓\nbun test\n# → 175 passing tests ✓'
      },
      cta: {
        title: 'Ready to orchestrate <span class="gradient-text">intelligently</span>?',
        desc: 'Join developers building the next generation of AI-powered tools with SoloFlow.',
        github: 'View on GitHub',
        docs: 'Read the Docs'
      },
      footer: {
        tagline: 'AI workflow orchestration by',
        product: 'Product',
        resources: 'Resources',
        friends: 'Friends',
        links: {
          features: 'Features',
          architecture: 'Architecture',
          memory: 'Memory System',
          lobster: 'lobster-press',
          comparison: 'Comparison',
          gettingStarted: 'Getting Started',
          github: 'GitHub',
          documentation: 'Documentation',
          changelog: 'Changelog',
          license: 'License (MIT)'
        },
        copyright: '© 2026 OpenClaw. All rights reserved. Built with ❤️ for the AI-native era.'
      }
    },
    zh: {
      a11y: {
        skip: '跳到正文'
      },
      nav: {
        features: '特性',
        architecture: '架构',
        memory: '记忆',
        lobster: 'lobster-press',
        comparison: '对比',
        getStarted: '开始使用'
      },
      hero: {
        badge: 'AI 工作流编排',
        title: '智能工作流的<span class="gradient-text">核心引擎</span>',
        subtitle: '将复杂的多步骤 AI 任务转化为结构化、可观察、可重试的工作流。<br class="hide-mobile">由认知记忆和智能路由驱动。',
        viewGithub: '查看 GitHub',
        getStarted: '开始使用',
        learnMore: '了解更多',
        stats: {
          tests: '测试通过',
          modules: '模块数',
          bundle: '包大小',
          mcpTools: 'MCP 工具',
          deps: '运行时依赖'
        }
      },
      problem: {
        tag: '问题',
        title: '为什么现有方案<span class="gradient-text">不够好</span>',
        desc: '现有工具迫使你在灵活性和可靠性之间做出选择。你要么得到一团糟的提示链，要么在规模化时崩溃的刚性管道。',
        solution: 'SoloFlow 解决了这一切',
        items: {
          chaos: { title: '执行混乱', desc: 'AI 智能体在缺乏结构化工作流或重试逻辑的情况下行为不可预测。' },
          memory: { title: '记忆缺失', desc: '没有统一的记忆系统，每个步骤都会忘记上一个步骤的上下文。' },
          routing: { title: '盲目路由', desc: '任务被盲目地路由，无法匹配到专门的智能体能力。' },
          evolution: { title: '重复陷阱', desc: '团队反复解决相同的子问题，而不是自动进化出可复用的技能。' }
        }
      },
      features: {
        tag: '核心特性',
        title: '生产级 AI 需要的一切',
        desc: '四大支柱使 SoloFlow 成为最先进的开源 AI 编排引擎。',
        memory: { title: '认知记忆', desc: '三层记忆系统（工作/情景/语义），配合艾宾浩斯遗忘曲线：R(t) = base × e^(-t/stability)。每次运行后自动记忆整合。' },
        routing: { title: '智能路由', desc: '自动将任务路由到专门的智能体：quick 处理简单任务，deep 处理复杂分析，visual 处理 UI 生成，ultrabrain 处理困难逻辑。' },
        architecture: { title: 'DAG + FSM 混合', desc: '工作流图的表达力与状态机的严谨性兼备。支持并行执行，自动重试配合指数退避。' },
        evolution: { title: '技能自动进化', desc: '自动检测重复模式并打包为可复用技能。您的工作流会随着时间自我改进。' }
      },
      architecture: {
        tag: '架构',
        title: '为<span class="gradient-text">可靠性</span>而构建',
        desc: '清晰的分层架构，关注点分离明确。',
        layers: {
          api: 'RPC API 层',
          workflow: '工作流引擎',
          memory: '记忆系统',
          agent: '智能体池',
          skills: '技能注册表'
        }
      },
      memory: {
        tag: '研究基础',
        title: '基于<span class="gradient-text-alt">认知科学</span>',
        desc: 'SoloFlow 的记忆系统基于人类记忆研究，具有真实的艾宾浩斯遗忘曲线衰减。在 <a href="https://github.com/SonicBotMan/lobster-press" target="_blank" rel="noopener" style="color: var(--color-accent-green);">lobster-press</a> 认知记忆引擎上构建。',
        tiers: {
          working: { title: '工作记忆', desc: '活跃任务上下文。保持 7±2 个焦点项目。快速访问，短期存在。任务完成后清除。', badge: '易失' },
          episodic: { title: '情景记忆', desc: '过去运行的时间戳经验。实现"记得那时"的推理。通过艾宾浩斯曲线定期整合衰减。', badge: '衰减' },
          semantic: { title: '语义记忆', desc: '来自重复模式的持久知识。在记忆衰减中保存的事实。技能自动进化的基础。', badge: '持久' }
        },
        curve: '艾宾浩斯遗忘曲线'
      },
      lobsterPress: {
        tag: '底层引擎',
        title: '由 <span class="gradient-text">lobster-press</span> 驱动',
        desc: 'lobster-press 是 SoloFlow 的认知记忆引擎，基于认知科学构建，提供 DAG 无损压缩、自适应遗忘曲线和语义记忆能力。',
        npm: 'NPM 包',
        stars: 'GitHub 星标',
        modules: '核心模块',
        moduleList: {
          cmv: { name: 'CMV 三遍无损压缩', desc: '三次验证机制确保记忆压缩零损失' },
          chlr: { name: 'C-HLR+ 自适应遗忘曲线', desc: '基于艾宾浩斯曲线智能调节记忆衰减' },
          focus: { name: 'Focus 主动压缩触发', desc: '智能检测并触发记忆压缩时机' },
          r3mem: { name: 'R³Mem 可逆三层压缩', desc: '工作记忆 → 情景记忆 → 语义记忆' },
          wmr: { name: 'WMR 工具框架', desc: '模块化工具注册与调用框架' }
        },
        cta: '探索 lobster-press',
        link: 'GitHub 仓库'
      },
      comparison: {
        tag: '竞品分析',
        title: '我们如何<span class="gradient-text">对比</span>',
        desc: '与最流行的 AI 编排工具逐项对比。',
        features: {
          discipline: '智能路由',
          cognitive: '认知记忆系统',
          evolution: '技能自动进化',
          dagFsm: 'DAG + FSM 混合',
          visual: '可视化构建器',
          multiUser: '多用户 / RBAC',
          mcp: 'MCP 工具接口',
          leanDeps: '轻量运行时依赖'
        }
      },
      metrics: {
        tests: { value: '175', label: 'TypeScript 测试', desc: '全部通过，严格模式' },
        modules: { value: '180+', label: '模块数', desc: '清晰的模块化架构' },
        bundle: { value: '0.27MB', label: '包大小', desc: '令人难以置信的轻量' },
        mcp: { value: '5', label: 'MCP 工具', desc: '暴露的接口' },
        deps: { value: '3', label: '运行时依赖', desc: 'jose、yaml、better-sqlite3' },
        license: { value: 'MIT', label: '许可证', desc: '完全开源' }
      },
      started: {
        tag: '快速开始',
        title: '几秒钟内<span class="gradient-text">启动</span>',
        desc: '安装 SoloFlow，定义您的第一个工作流，然后看着它编排执行。就这么简单。',
        tabs: { install: '安装', workflow: '创建工作流', run: '运行与监控' },
        installCode: '# 将 SoloFlow 克隆到 OpenClaw 插件目录\ngit clone https://github.com/SonicBotMan/SoloFlow.git\ncd SoloFlow/openclaw-plugin\n\n# 使用 Bun 安装依赖\nbun install\n\n# 构建插件\nbun run build\n\n# 验证 - 175 个测试通过 ✓\nbun test\n# → 175 个测试通过 ✓'
      },
      cta: {
        title: '准备好<span class="gradient-text">智能编排</span>了吗？',
        desc: '加入开发者社区，使用 SoloFlow 构建下一代 AI 工具。',
        github: '查看 GitHub',
        docs: '阅读文档'
      },
      footer: {
        tagline: 'AI 工作流编排 by',
        product: '产品',
        resources: '资源',
        friends: '友情链接',
        links: {
          features: '特性',
          architecture: '架构',
          memory: '记忆系统',
          lobster: 'lobster-press',
          comparison: '对比',
          gettingStarted: '开始使用',
          github: 'GitHub',
          documentation: '文档',
          changelog: '更新日志',
          license: '许可证 (MIT)'
        },
        copyright: '© 2026 OpenClaw. 保留所有权利。用 ❤️ 为 AI 原生时代构建。'
      }
    }
  };

  var currentLang = localStorage.getItem('soloflow-lang') || 'en';

  function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('soloflow-lang', lang);
    
    var t = translations[lang];
    var html = document.documentElement;
    html.setAttribute('lang', lang);
    
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      var keys = key.split('.');
      var val = t;
      for (var i = 0; i < keys.length; i++) {
        val = val[keys[i]];
      }
      if (val) el.innerHTML = val;
    });

    var langToggle = document.getElementById('langToggle');
    if (langToggle) {
      var enSpan = langToggle.querySelector('.lang-en');
      var zhSpan = langToggle.querySelector('.lang-zh');
      if (enSpan && zhSpan) {
        enSpan.classList.toggle('active', lang === 'en');
        zhSpan.classList.toggle('active', lang === 'zh');
      }
    }
  }

  function initLanguageToggle() {
    setLanguage(currentLang);
    
    var langToggle = document.getElementById('langToggle');
    if (langToggle) {
      langToggle.addEventListener('click', function() {
        var newLang = currentLang === 'en' ? 'zh' : 'en';
        setLanguage(newLang);
      });
    }
  }

  function initNavigation() {
    var lastScroll = 0;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (y > 40) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
      lastScroll = y;
    }, { passive: true });

    if (navToggle && mobileMenu) {
      navToggle.addEventListener('click', function () {
        navToggle.classList.toggle('active');
        mobileMenu.classList.toggle('open');
        document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
      });

      var mobileLinks = mobileMenu.querySelectorAll('a');
      mobileLinks.forEach(function (link) {
        link.addEventListener('click', function () {
          navToggle.classList.remove('active');
          mobileMenu.classList.remove('open');
          document.body.style.overflow = '';
        });
      });
    }
  }

  function initRevealObserver() {
    var reveals = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    reveals.forEach(function (el) { observer.observe(el); });
  }

  function initCountUp() {
    var all = document.querySelectorAll('[data-target]');
    if (!('IntersectionObserver' in window)) {
      all.forEach(animateCounter);
      return;
    }

    // Hero stats sit in a short inline box — requiring 50% intersection often
    // never fires for small spans; animate them as soon as the page loads.
    document.querySelectorAll('#hero [data-target]').forEach(function (el) {
      animateCounter(el);
    });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px 80px 0px' });

    all.forEach(function (el) {
      if (el.closest('#hero')) return;
      observer.observe(el);
    });
  }

  function animateCounter(el) {
    var target = parseFloat(el.getAttribute('data-target'));
    var decimals = parseInt(el.getAttribute('data-decimals') || '0');
    var suffix = el.getAttribute('data-suffix') || '';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = target.toFixed(decimals) + suffix;
      return;
    }
    var duration = 1500;
    var start = performance.now();

    function update(now) {
      var elapsed = now - start;
      var progress = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = eased * target;
      el.textContent = current.toFixed(decimals) + suffix;
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  function initMetricBars() {
    var cards = document.querySelectorAll('.metric-card');
    if (!('IntersectionObserver' in window)) {
      cards.forEach(function (c) { c.classList.add('visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    cards.forEach(function (el) { observer.observe(el); });
  }

  function initCodeTabs() {
    var tabs = document.querySelectorAll('.code-tab');
    var panels = document.querySelectorAll('.code-panel');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-tab');

        tabs.forEach(function (t) { t.classList.remove('active'); });
        panels.forEach(function (p) { p.classList.remove('active'); });

        tab.classList.add('active');
        var panel = document.getElementById('panel-' + target);
        if (panel) panel.classList.add('active');
      });
    });

    var copyButtons = document.querySelectorAll('.code-copy');
    copyButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-copy');
        var panel = document.getElementById('panel-' + tab);
        if (!panel) return;
        var code = panel.querySelector('code');
        if (!code) return;
        navigator.clipboard.writeText(code.textContent).then(function () {
          btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
          setTimeout(function () {
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
          }, 2000);
        });
      });
    });
  }

  function drawForgettingCurve() {
    if (!canvas || !ctx) return;

    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    var w = rect.width;
    var h = rect.height;
    var pad = { top: 20, right: 20, bottom: 30, left: 45 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var gy = pad.top + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(w - pad.right, gy);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px ' + getComputedStyle(document.body).getPropertyValue('--font-mono').trim();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ['100%', '75%', '50%', '25%', '0%'].forEach(function (label, idx) {
      ctx.fillText(label, pad.left - 8, pad.top + (plotH / 4) * idx);
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ['1h', '6h', '1d', '3d', '7d'].forEach(function (label, idx) {
      ctx.fillText(label, pad.left + (plotW / 4) * idx, h - pad.bottom + 10);
    });

    var baseRetention = 0.85;
    var stability = 0.35;

    function forgettingCurve(t) {
      return baseRetention * Math.exp(-t / stability);
    }

    function plotCurve(color, width, dashPattern) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dashPattern || []);
      ctx.beginPath();
      for (var px = 0; px <= plotW; px++) {
        var t = (px / plotW) * 2;
        var val = forgettingCurve(t);
        val = Math.max(0, val);
        var py = pad.top + plotH * (1 - val);
        if (px === 0) ctx.moveTo(pad.left + px, py);
        else ctx.lineTo(pad.left + px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    plotCurve('rgba(192, 132, 252, 0.15)', 8, []);

    var grad = ctx.createLinearGradient(pad.left, 0, w - pad.right, 0);
    grad.addColorStop(0, '#C084FC');
    grad.addColorStop(0.5, '#60A5FA');
    grad.addColorStop(1, '#6EE7B7');
    plotCurve(grad, 2.5, []);

    var fillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    fillGrad.addColorStop(0, 'rgba(192, 132, 252, 0.12)');
    fillGrad.addColorStop(1, 'rgba(192, 132, 252, 0.0)');
    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    for (var fpx = 0; fpx <= plotW; fpx++) {
      var ft = (fpx / plotW) * 2;
      var fval = forgettingCurve(ft);
      fval = Math.max(0, fval);
      var fpy = pad.top + plotH * (1 - fval);
      ctx.lineTo(pad.left + fpx, fpy);
    }
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.closePath();
    ctx.fill();

    var reviewPoints = [0.15, 0.4, 0.7];
    var reviewColors = ['#6EE7B7', '#60A5FA', '#C084FC'];
    var reviewLabels = ['Review 1', 'Review 2', 'Review 3'];

    reviewPoints.forEach(function (rx, idx) {
      var rpx = rx * plotW;
      var rt = rx * 2;
      var rval = forgettingCurve(rt);
      rval = Math.max(0, rval);
      var rpy = pad.top + plotH * (1 - rval);

      ctx.beginPath();
      ctx.arc(pad.left + rpx, rpy, 5, 0, Math.PI * 2);
      ctx.fillStyle = reviewColors[idx];
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,12,20,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = reviewColors[idx];
      ctx.font = '9px ' + getComputedStyle(document.body).getPropertyValue('--font-mono').trim();
      ctx.textAlign = 'center';
      ctx.fillText(reviewLabels[idx], pad.left + rpx, rpy - 14);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '9px ' + getComputedStyle(document.body).getPropertyValue('--font-mono').trim();
    ctx.textAlign = 'left';
    ctx.fillText('← Time since learning', pad.left + plotW * 0.55, h - pad.bottom + 10);

    ctx.save();
    ctx.translate(12, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Retention →', 0, 0);
    ctx.restore();
  }

  function initSmoothScroll() {
    var anchors = document.querySelectorAll('a[href^="#"]');
    anchors.forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var href = anchor.getAttribute('href');
        if (href === '#') return;
        var target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function initMouseGlow() {
    var glassCards = document.querySelectorAll('.glass-card');
    glassCards.forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', x + 'px');
        card.style.setProperty('--mouse-y', y + 'px');
        card.style.background = 'radial-gradient(300px circle at ' + x + 'px ' + y + 'px, rgba(110,231,183,0.03), rgba(22,25,41,0.7) 70%)';
      });

      card.addEventListener('mouseleave', function () {
        card.style.background = 'var(--color-bg-card)';
      });
    });
  }

  function initParallaxHero() {
    var heroVisual = document.getElementById('heroVisual');
    if (!heroVisual) return;

    window.addEventListener('mousemove', function (e) {
      if (window.innerWidth < 768) return;
      var x = (e.clientX / window.innerWidth - 0.5) * 10;
      var y = (e.clientY / window.innerHeight - 0.5) * 5;
      heroVisual.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    }, { passive: true });
  }

  function initParticleAnimation() {
    var particles = document.querySelectorAll('.flow-particles .particle');
    if (particles.length === 0) return;

    var paths = [
      [{x: 170, y: 140}, {x: 300, y: 80}, {x: 420, y: 80}, {x: 460, y: 160}, {x: 580, y: 160}, {x: 690, y: 160}],
      [{x: 170, y: 160}, {x: 300, y: 240}, {x: 420, y: 240}, {x: 460, y: 160}, {x: 580, y: 160}, {x: 690, y: 160}],
      [{x: 170, y: 140}, {x: 300, y: 80}, {x: 420, y: 80}, {x: 460, y: 160}, {x: 580, y: 160}, {x: 690, y: 160}]
    ];
    var durations = [3000, 4000, 3500];
    var startDelays = [0, 500, 1000];

    particles.forEach(function (particle, idx) {
      particle.setAttribute('cx', paths[idx][0].x);
      particle.setAttribute('cy', paths[idx][0].y);

      var path = paths[idx];
      var duration = durations[idx];
      var startDelay = startDelays[idx];
      var startTime = null;

      function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        var elapsed = timestamp - startTime - startDelay;
        
        if (elapsed < 0) {
          requestAnimationFrame(animate);
          return;
        }

        var cycleTime = elapsed % duration;
        var progress = cycleTime / duration;
        var pos = getPositionOnPath(path, progress);
        particle.setAttribute('cx', pos.x);
        particle.setAttribute('cy', pos.y);

        var opacity = 1;
        if (progress < 0.05) {
          opacity = progress / 0.05;
        } else if (progress > 0.95) {
          opacity = (1 - progress) / 0.05;
        }
        particle.setAttribute('opacity', Math.max(0, Math.min(1, opacity)));

        requestAnimationFrame(animate);
      }

      function getPositionOnPath(pathPoints, t) {
        var totalSegments = pathPoints.length - 1;
        var scaledT = t * totalSegments;
        var segmentIndex = Math.min(Math.floor(scaledT), totalSegments - 1);
        var segmentT = scaledT - segmentIndex;

        var p1 = pathPoints[segmentIndex];
        var p2 = pathPoints[segmentIndex + 1];

        return {
          x: p1.x + (p2.x - p1.x) * segmentT,
          y: p1.y + (p2.y - p1.y) * segmentT
        };
      }

      requestAnimationFrame(animate);
    });
  }

  function initLobsterStars() {
    var starCountEl = document.getElementById('lobster-star-count');
    if (!starCountEl) return;

    var cacheKey = 'soloflow-lobster-stars';
    var cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    var cached = localStorage.getItem(cacheKey);
    var fallback = 28; // Last known star count

    if (cached) {
      try {
        var data = JSON.parse(cached);
        if (Date.now() - data.timestamp < cacheExpiry) {
          starCountEl.textContent = data.count;
          return;
        }
      } catch (e) {}
    }

    fetch('https://api.github.com/repos/SonicBotMan/lobster-press')
      .then(function(response) { return response.json(); })
      .then(function(data) {
        if (data.stargazers_count !== undefined) {
          starCountEl.textContent = data.stargazers_count;
          localStorage.setItem(cacheKey, JSON.stringify({
            count: data.stargazers_count,
            timestamp: Date.now()
          }));
        }
      })
      .catch(function() {
        starCountEl.textContent = fallback;
      });
  }

  function init() {
    initLanguageToggle();
    initNavigation();
    initRevealObserver();
    initCountUp();
    initMetricBars();
    initCodeTabs();
    initSmoothScroll();
    initMouseGlow();
    initParallaxHero();
    initParticleAnimation();
    initLobsterStars();

    if (canvas) {
      drawForgettingCurve();
      var resizeTimeout;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(drawForgettingCurve, 200);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
