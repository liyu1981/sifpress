import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const LANGUAGE_KEY = 'language'

const resources = {
  en: {
    translation: {
      app: 'Single PHP React SPA',
      nav: {
        home: 'Home',
        article: 'Articles',
        settings: 'Settings',
      },
      theme: {
        toggle: 'Toggle theme (light / dark / system)',
        current: 'Theme: {{theme}}',
        light: 'light',
        dark: 'dark',
        system: 'system',
      },
      language: {
        toggle: 'Switch language',
      },
      article: {
        badge: 'Blog',
        indexTitle: 'Articles',
        indexDescription:
          'Notes on a single-file, markdown-powered blog — math, diagrams, and flexible images.',
        reading: '{{min}} min read',
        readMore: 'Read more',
        toc: 'On this page',
        prev: 'Older',
        next: 'Newer',
        backToIndex: 'All articles',
        loadingTitle: 'Loading…',
        notFoundBadge: '404',
        notFoundTitle: 'Article not found',
        notFoundDescription: 'The article you are looking for does not exist.',
      },
      settings: {
        badge: 'Route → settings / POST API',
        title: 'Settings',
        description:
          'Create a project via ?module=api&action=projects (POST).',
        name: 'Project name',
        placeholder: 'My project',
        create: 'Create',
        creating: 'Creating…',
        lastCreated: 'Last created',
        error: 'Could not create project.',
      },
      notFound: {
        badge: '404',
        title: 'Not found',
        description: 'The route "{{href}}" does not exist.',
        back: 'Back home',
      },
    },
  },
  zh: {
    translation: {
      app: '单文件 PHP React SPA',
      nav: {
        home: '首页',
        article: '文章',
        settings: '设置',
      },
      theme: {
        toggle: '切换主题（浅色 / 深色 / 跟随系统）',
        current: '主题：{{theme}}',
        light: '浅色',
        dark: '深色',
        system: '跟随系统',
      },
      language: {
        toggle: '切换语言',
      },
      article: {
        badge: '博客',
        indexTitle: '文章',
        indexDescription:
          '关于单文件、markdown 驱动的博客的笔记——数学公式、图表和灵活的图像。',
        reading: '阅读约 {{min}} 分钟',
        readMore: '阅读全文',
        toc: '本页目录',
        prev: '上一篇',
        next: '下一篇',
        backToIndex: '全部文章',
        loadingTitle: '加载中…',
        notFoundBadge: '404',
        notFoundTitle: '文章未找到',
        notFoundDescription: '你要找的文章不存在。',
      },
      settings: {
        badge: '路由 → 设置 / POST API',
        title: '设置',
        description: '通过 ?module=api&action=projects（POST）创建项目。',
        name: '项目名称',
        placeholder: '我的项目',
        create: '创建',
        creating: '创建中…',
        lastCreated: '最近创建',
        error: '无法创建项目。',
      },
      notFound: {
        badge: '404',
        title: '页面未找到',
        description: '路由 "{{href}}" 不存在。',
        back: '返回首页',
      },
    },
  },
}

const saved = localStorage.getItem(LANGUAGE_KEY)

i18n.use(initReactI18next).init({
  resources,
  lng: saved === 'zh' ? 'zh' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(LANGUAGE_KEY, lng)
  document.documentElement.lang = lng
})

export default i18n
