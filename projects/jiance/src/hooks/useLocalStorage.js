import { useState, useEffect, useCallback } from 'react'

/**
 * 简册 · localStorage 适配 hook（v1.12 Day 16 补全）
 *
 * 用法：
 *   const [expenses, setExpenses, removeExpenses] = useLocalStorage(
 *     'jiance.v1.expenses',
 *     []
 *   )
 *
 *   - key：抽屉 key（与 TECH_DESIGN.md 第 5 节一致：jiance.v1.*）
 *   - initialValue：首次访问 key 不存在时返回的初值
 *   - 返回 [value, setValue, remove]：setValue 跟 useState 一样，remove 清除抽屉
 *
 * 行为：
 *   - 首次渲染同步读抽屉（避免 useEffect 的"先用初值再异步替换"闪屏）
 *   - 写入失败（容量满 / 隐私模式）→ console.error，不抛
 *   - 解析失败（数据被手改坏）→ 静默回退到 initialValue
 *
 * 与 Day 1-15 单文件版兼容 —— key 字符串照旧（'jiance.v1.expenses' 等），
 * 数据 JSON 形状不变，旧数据可直接 import / export 互通。
 */
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initialValue
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? initialValue : JSON.parse(raw)
    } catch {
      // 解析失败 → 静默回退到初值
      return initialValue
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      // 容量满 / Safari 隐私模式 / 禁用 storage —— 不抛
      // eslint-disable-next-line no-console
      console.error('useLocalStorage 写入失败：', key, e)
    }
  }, [key, value])

  const remove = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(key)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('useLocalStorage remove 失败：', key, e)
    }
  }, [key])

  return [value, setValue, remove]
}

/* ---------- 简册专用的命名常量（防拼写错）---------- */

export const KEYS = {
  expenses: 'jiance.v1.expenses',
  entries: 'jiance.v1.entries',
  profile: 'jiance.v1.profile',
  matches: 'jiance.v1.matches',
  meta: 'jiance.v1.meta',
  matchDraft: 'jiance.v1.matchDraft',
}