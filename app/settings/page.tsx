"use client";

import { useState, useEffect } from 'react';

type LLMProvider = 'ondevice' | 'openrouter';

export default function SettingsPage() {
  const [provider, setProvider] = useState<LLMProvider>('ondevice');
  const [selectedModel, setSelectedModel] = useState('openai/gpt-3.5-turbo');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load saved settings
  useEffect(() => {
    const savedProvider = localStorage.getItem('llmProvider') as LLMProvider;
    const savedModel = localStorage.getItem('openRouterModel');
    if (savedProvider) setProvider(savedProvider);
    if (savedModel) setSelectedModel(savedModel);
  }, []);

  const handleSave = () => {
    localStorage.setItem('llmProvider', provider);
    localStorage.setItem('openRouterModel', selectedModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'This is a test document. It contains multiple sentences to test the AI summarization capabilities. The system should be able to process this text and generate a meaningful summary.',
          provider,
          model: provider === 'openrouter' ? selectedModel : undefined,
        }),
      });

      const data = await response.json();
      if (data.error) {
        setTestResult(`❌ Error: ${data.error}`);
      } else if (data.summary) {
        setTestResult(`✅ Success: ${data.summary}`);
      } else {
        setTestResult(`ℹ️ ${data.message || 'On-device LLM will be used'}`);
      }
    } catch (error: any) {
      setTestResult(`❌ Error: ${error.message}`);
    } finally {
      setTesting(false);
    }
  };

  const popularModels = [
    { value: 'openai/gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Fast & Cheap)' },
    { value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo (Best Quality)' },
    { value: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku (Fast)' },
    { value: 'anthropic/claude-3-sonnet', label: 'Claude 3 Sonnet (Balanced)' },
    { value: 'google/gemini-pro', label: 'Gemini Pro' },
    { value: 'meta-llama/llama-3-8b-instruct', label: 'Llama 3 8B (Open Source)' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 font-sans">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Settings
          </h1>
          <p className="text-gray-600 text-sm">
            Configure AI provider and model preferences
          </p>
        </div>

        {/* LLM Provider Selection */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">🤖 AI Provider Settings</h2>
          
          {/* Provider Toggle */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select AI Provider
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* On-Device Option */}
              <button
                onClick={() => setProvider('ondevice')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  provider === 'ondevice'
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${
                    provider === 'ondevice' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                  }`}>
                    {provider === 'ondevice' && (
                      <div className="w-full h-full rounded-full bg-white scale-50"></div>
                    )}
                  </div>
                  <span className="font-semibold text-gray-800">On-Device LLM</span>
                </div>
                <p className="text-xs text-gray-600 ml-7">
                  Uses @xenova/transformers running locally in your browser/server. 
                  <br />✅ Free, Private, No API costs
                  <br />⚠️ Slower, Limited model options
                </p>
              </button>

              {/* OpenRouter Option */}
              <button
                onClick={() => setProvider('openrouter')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  provider === 'openrouter'
                    ? 'border-purple-500 bg-purple-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${
                    provider === 'openrouter' ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                  }`}>
                    {provider === 'openrouter' && (
                      <div className="w-full h-full rounded-full bg-white scale-50"></div>
                    )}
                  </div>
                  <span className="font-semibold text-gray-800">OpenRouter API</span>
                </div>
                <p className="text-xs text-gray-600 ml-7">
                  Access multiple AI models via OpenRouter.
                  <br />✅ Fast, High quality, Many models
                  <br />⚠️ Requires API key, Usage costs
                </p>
              </button>
            </div>
          </div>

          {/* OpenRouter Configuration */}
          {provider === 'openrouter' && (
            <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-800 mb-2">🔑 API Key Setup Required</p>
                <p className="text-xs text-blue-700 mb-2">
                  Add your OpenRouter API key to <code className="bg-blue-100 px-1 rounded">.env.local</code> file:
                </p>
                <code className="block text-xs bg-blue-100 p-2 rounded mb-2">
                  OPENROUTER_API_KEY=sk-or-v1-your-key-here
                </code>
                <p className="text-xs text-blue-700">
                  Get your key from{' '}
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                    openrouter.ai/keys
                  </a>
                  {' '}then restart your dev server.
                </p>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {popularModels.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Test & Save Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? 'Testing...' : '🧪 Test Connection'}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition shadow-md"
            >
              💾 Save Settings
            </button>
            {saved && (
              <span className="flex items-center text-green-600 text-sm">
                ✓ Saved!
              </span>
            )}
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${
              testResult.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-200' :
              testResult.startsWith('❌') ? 'bg-red-50 text-red-800 border border-red-200' :
              'bg-blue-50 text-blue-800 border border-blue-200'
            }`}>
              {testResult}
            </div>
          )}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="text-blue-600 font-semibold mb-2">🔒 Privacy & Security</div>
            <p className="text-xs text-gray-600">
              On-device processing keeps your data completely private. OpenRouter processes data through their API.
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            <div className="text-green-600 font-semibold mb-2">💰 Cost Comparison</div>
            <p className="text-xs text-gray-600">
              On-device: Free but slower. OpenRouter: Pay per use, faster responses, access to premium models.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}














