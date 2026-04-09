import React, { useEffect, useState } from 'react';
import { Button } from '../base/Button';
import { loadLlmConfig, saveLlmConfig } from '@engine/chronicle/llm/llmConfig';
import { invalidateProvider } from '@engine/chronicle/chronicleService';
import { createProvider } from '@engine/chronicle/llm/createProvider';
import { DEFAULT_LLM_CONFIG, type LlmConfig } from '@engine/chronicle/types';

const LlmConfigPanel: React.FC = () => {
  const [config, setConfig] = useState<LlmConfig>(DEFAULT_LLM_CONFIG);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    loadLlmConfig().then((cfg) => {
      setConfig(cfg);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    await saveLlmConfig(config);
    invalidateProvider();
    setTestResult('已保存');
    setTimeout(() => setTestResult(null), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // 先校验：用户选 direct 但缺 apiKey → 工厂会静默降级 mock，
      // 用户会看到"成功"但其实根本没打到目标 LLM。这里显式拦截。
      if (config.provider === 'direct' && (!config.apiKey || !config.apiKey.trim())) {
        setTestResult('连接失败：选择 Direct 模式但未填写 API Key');
        return;
      }
      if (config.provider === 'proxy') {
        setTestResult('连接失败：Proxy 模式暂未实现');
        return;
      }

      const provider = createProvider(config);
      // 二次防御：工厂返回的 provider 必须与用户选择一致，
      // 否则就是被降级了（缺 key / 不支持），不能算成功。
      if (provider.id !== config.provider) {
        setTestResult(`连接失败：已被降级为 ${provider.id}，请检查配置`);
        return;
      }

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 15000);
      const out = await provider.generate(
        { system: '请回复 ok', user: '测试连接' },
        // 64 而非 8：思考型模型(Kimi K2 等)前几十 token 全在 reasoning，
        // 8 token 经常被截断到 content 为空，触发"LLM 返回空内容"假阳性
        { maxTokens: 64, signal: ac.signal },
      );
      clearTimeout(timer);
      setTestResult(`连接成功（provider=${provider.id}）：${out.slice(0, 40)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult(`连接失败：${msg}`);
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="p-4 text-[var(--color-text-muted)]">加载中…</div>;

  return (
    <div className="p-5 flex flex-col gap-3 text-sm">
      <div className="text-[var(--color-text-muted)] text-xs leading-relaxed">
        AI 史书使用 LLM 在游戏内自动撰写。配置仅保存在本地浏览器，绝不进存档文件。
        缺 API Key 或连接失败时自动降级为离线兜底（直接拼接事件原文）。
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[var(--color-text-muted)] text-xs">Provider</span>
        <select
          value={config.provider}
          onChange={(e) =>
            setConfig({ ...config, provider: e.target.value as LlmConfig['provider'] })
          }
          className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text)]"
        >
          <option value="direct">Direct（BYOK 直连）</option>
          <option value="mock">Mock（离线兜底，仅拼接事件）</option>
          <option value="proxy" disabled>
            Proxy（暂未实现）
          </option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[var(--color-text-muted)] text-xs">Model</span>
        <input
          type="text"
          value={config.model}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
          className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text)]"
          placeholder="moonshot-v1-8k"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[var(--color-text-muted)] text-xs">月度模型（可省，默认同上）</span>
        <input
          type="text"
          value={config.monthModel ?? ''}
          onChange={(e) => setConfig({ ...config, monthModel: e.target.value })}
          className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text)]"
          placeholder="moonshot-v1-8k"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[var(--color-text-muted)] text-xs">API Key（仅本地存储，不进存档）</span>
        <input
          type="password"
          value={config.apiKey ?? ''}
          onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
          className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text)] font-mono"
          placeholder="sk-..."
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[var(--color-text-muted)] text-xs">Base URL</span>
        <input
          type="text"
          value={config.baseUrl ?? ''}
          onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
          className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text)] font-mono"
          placeholder="https://api.moonshot.cn/v1"
        />
      </label>

      <div className="flex items-center gap-2 mt-2">
        <Button variant="primary" size="sm" onClick={handleSave}>
          保存
        </Button>
        <Button variant="default" size="sm" onClick={handleTest} loading={testing}>
          测试连接
        </Button>
        {testResult && (
          <span
            className={`text-xs ${
              testResult.startsWith('连接失败') ? 'text-[var(--color-accent-red)]' : 'text-[var(--color-accent-gold)]'
            }`}
          >
            {testResult}
          </span>
        )}
      </div>
    </div>
  );
};

export default LlmConfigPanel;
