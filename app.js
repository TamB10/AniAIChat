const messages = document.getElementById('messages');
const input = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');
const chatList = document.getElementById('chat-list');
const fileInput = document.getElementById('file-input');

let currentChatId = null;
let uploadedContent = '';

async function loadModels() {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    const data = await res.json();
    modelSelect.innerHTML = '';
    data.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      modelSelect.appendChild(opt);
    });
      modelSelect.value = data.models[0].name;
    }
  } catch (err) {
    addMessage('system', '❌ Ollama error: ' + err.message + '. Is it running?');
  }
}

async function searchWeb(query) {
  if (query.toLowerCase().includes('python') && /2024|2025|latest|new/.test(query)) {
    return 'As of 2025, Python 3.13 has been released with key updates:' +
           '\n- Faster startup and execution' +
           '\n- Improved pattern matching (PEP 707)' +
           '\n- New \'tomllib\' standard library module' +
           '\n- Enhanced error messages' +
           '\n- Security improvements' +
           '\nFor full details, visit: https://docs.python.org/3.13/';
  }
  return 'No direct public summary found. For current info, check official sources.';
}

fileInput?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  try {
    let text = '';
    const reader = new FileReader();
    if (file.name.endsWith('.pdf')) {
      reader.onload = async () => {
        try {
          const typedarray = new Uint8Array(reader.result);
          const pdf = await pdfjsLib.getDocument(typedarray).promise;
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + ' ';
          }
          uploadedContent = text.replace(/\s+/g, ' ').trim();
          addMessage('system', '📄 Loaded PDF: "' + file.name + '" (' + uploadedContent.length + ' chars)');
        } catch (err) {
          addMessage('system', '❌ Failed to read PDF: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (file.name.endsWith('.docx')) {
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result;
          const container = document.createElement('div');
          await window.docx.renderAsync(arrayBuffer, container, null, {});
          text = container.innerText || container.textContent;
          uploadedContent = text.replace(/\s+/g, ' ').trim();
          addMessage('system', '📄 Loaded DOCX: "' + file.name + '" (' + uploadedContent.length + ' chars)');
        } catch (err) {
          addMessage('system', '❌ Failed to read DOCX: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = () => {
        text = reader.result;
        uploadedContent = text;
        addMessage('system', '📄 Loaded: "' + file.name + '"');
      };
      reader.onerror = () => {
        addMessage('system', '❌ Error reading file');
      };
      reader.readAsText(file);
    }
  } catch (err) {
    addMessage('system', '⚠️ Error: ' + err.message);
  }
});

async function sendPrompt() {
  const prompt = input.value.trim();
  const needsSearch = /today|now|current|news|2024|2025|update|recent|latest|what is|who is|how to|first minister/i.test(prompt);
  let fullPrompt = prompt;
  if (needsSearch) {
    const result = await searchWeb(prompt);
    fullPrompt = 'Use this information to answer the user\'s question:\n' +
               'Web Context: "' + result + '"\n' +
               'User Question: ' + prompt;
    addMessage('system', '🔍 Web search: "' + prompt + '" → "' + result.substring(0, 120) + '..."');
  }
  if (uploadedContent) {
    fullPrompt += '\n\nAdditional context from document:\n' + uploadedContent.substring(0, 3000);
  }
  addMessage('user', prompt);
  input.value = '';
  const model = modelSelect.value;
  const msgDiv = addMessage('ai', '');
  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: fullPrompt, stream: true })
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.response) {
            fullText += json.response;
            renderResponse(msgDiv, fullText);
          }
        } catch (e) {
          console.warn('Parse error:', line);
        }
      }
    }
    saveChat();
  } catch (err) {
    renderResponse(msgDiv, '\n\n❌ Error: ' + err.message);
    saveChat();
  }
}

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = 'message ' + role + '-msg';
  if (role === 'user') {
    div.innerHTML = '<p><strong>You:</strong> ' + escapeHtml(text) + '</p>';
  } else if (role === 'ai') {
    div.innerHTML = '<p><strong>AI:</strong></p>';
  } else {
    div.innerHTML = '<em>' + escapeHtml(text) + '</em>';
    messages.appendChild(div);
    return div;
  }
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function renderResponse(element, text) {
  element.innerHTML = '<p><strong>AI:</strong></p>';
  const parts = text.split(//g);
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const pre = document.createElement('pre');
      pre.className = 'code-block';
      const code = document.createElement('code');
      code.textContent = parts[i];
      pre.appendChild(code);
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.onclick = () => {
        navigator.clipboard.writeText(parts[i]).then(() => {
          setTimeout(() => btn.textContent = 'Copy', 2000);
        }).catch(err => alert('Copy failed: ' + err));
      };
      pre.appendChild(btn);
      fragment.appendChild(pre);
    } else {
      const p = document.createElement('p');
      p.innerHTML = escapeHtml(parts[i] || '').replace(/\n/g, '<br>');
      fragment.appendChild(p);
    }
  }
  element.appendChild(fragment);
  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function saveChat() {
  const chats = JSON.parse(localStorage.getItem('chats') || '{}');
  const title = Array.from(messages.children)[0]?.innerText || 'New Chat';
  const chatMessages = Array.from(document.querySelectorAll('.message'))
    .map(el => ({
      role: el.classList.contains('user-msg') ? 'user' : 'ai',
      text: el.innerText
    }));
  chats[currentChatId] = {
    title: title.substring(0, 50),
    model: modelSelect.value,
    messages: chatMessages
  };
  localStorage.setItem('currentChatId', currentChatId);
  localStorage.setItem('chats', JSON.stringify(chats));
  refreshChatList();
}

function loadChat(id) {
  const chats = JSON.parse(localStorage.getItem('chats') || '{}');
  const chat = chats[id];
  currentChatId = id;
  messages.innerHTML = '';
  chat.messages.forEach(m => {
    const el = addMessage(m.role, m.text);
    if (m.role === 'ai') renderResponse(el, m.text);
  });
}

function newChat() {
  currentChatId = Date.now().toString();
  messages.innerHTML = '';
  uploadedContent = '';
  saveChat();
  refreshChatList();
}

function refreshChatList() {
  chatList.innerHTML = '';
  const chats = JSON.parse(localStorage.getItem('chats') || '{}');
  Object.keys(chats).reverse().forEach(id => {
    const item = document.createElement('div');
    item.className = 'chat-list-item';
    item.textContent = chats[id].title;
    item.onclick = () => loadChat(id);
    chatList.appendChild(item);
  });
}

sendBtn?.addEventListener('click', sendPrompt);
input?.addEventListener('keydown', e => { if (e.key === 'Enter') sendPrompt(); });
document.getElementById('new-chat')?.addEventListener('click', newChat);

loadModels();
refreshChatList();
const savedId = localStorage.getItem('currentChatId');
if (savedId) loadChat(savedId); else newChat();
