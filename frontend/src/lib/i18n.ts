import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const LANGUAGE_KEY = 'language'

const resources = {
  en: {
    translation: {
      app: 'Single PHP React SPA',
      nav: {
        home: 'Home',
        editor: 'Editor 123',
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
      home: {
        badge: 'PHP + React',
        title: 'Single-file SPA',
        description:
          'One index.php that works at the domain root or any subdirectory — no rewrite rules required.',
        url: 'Current URL',
        api: 'API response (hello)',
        time: 'Server time',
        hint: 'Routes are pure query parameters (u=...). Try the links below.',
        loading: 'Loading…',
      },
      editor: {
        badge: 'Route → editor',
        title: 'Editor',
        description: 'You are editing document {{id}}.',
        next: 'Next doc',
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
        editor: '编辑器 123',
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
      home: {
        badge: 'PHP + React',
        title: '单文件 SPA',
        description:
          '一个 index.php，可在域名根目录或任意子目录运行——无需任何重写规则。',
        url: '当前 URL',
        api: 'API 响应 (hello)',
        time: '服务器时间',
        hint: '路由完全是查询参数（u=...）。试试下面的链接。',
        loading: '加载中…',
      },
      editor: {
        badge: '路由 → 编辑器',
        title: '编辑器',
        description: '你正在编辑文档 {{id}}。',
        next: '下一篇',
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
