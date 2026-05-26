import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";

// ⚠️ SUBSTITUA PELAS CREDENCIAIS DO SEU CONSOLE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyATr3AFcjJtamWRKZEBBcsA8vi-_ckCeEs",
  authDomain: "games2-c9b04.firebaseapp.com",
  projectId: "games2-c9b04",
  storageBucket: "games2-c9b04.firebasestorage.app",
  messagingSenderId: "417046305603",
  appId: "1:417046305603:web:52e921b1f10f9ed4b76df6"
};

// Inicialização Básica do Firebase Auth
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

provider.addScope('https://www.googleapis.com/auth/drive.appdata');

let currentUser = null;
let googleAccessToken = null; 
let activeBlobUrl = null; 

// Captura de Elementos da UI
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// Listener de Sessão Ativa
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        btnLogin.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userAvatar.src = user.photoURL;
        userName.textContent = user.displayName.split(' ')[0];
        
        // Se houver um token guardado na sessão após a purga do refresh, restaura automaticamente
        if (sessionStorage.getItem('g_token')) {
            googleAccessToken = sessionStorage.getItem('g_token');
        }
    } else {
        currentUser = null;
        googleAccessToken = null;
        sessionStorage.removeItem('g_token');
        btnLogin.classList.remove('hidden');
        userInfo.classList.add('hidden');
    }
});

// Abertura do Fluxo de Autenticação do Google
btnLogin.addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        googleAccessToken = credential.accessToken;
        
        // Memoriza o token na sessão para não deslogar o Drive no fechamento por Refresh
        sessionStorage.setItem('g_token', googleAccessToken);
        console.log("Token do Google Drive obtido com sucesso!");
    } catch (error) {
        console.error("Erro no fluxo de login: ", error);
    }
});

btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('g_token');
    signOut(auth);
});

/**
 * Executado ao carregar a página: Verifica se o site veio de um comando de fechamento de emulador
 */
window.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('emu_purge_active') === 'true') {
        sessionStorage.removeItem('emu_purge_active');
        // Garante o posicionamento visual correto na Dashboard limpa
        document.getElementById('emulator-screen').classList.add('hidden');
        document.getElementById('catalog-screen').classList.remove('hidden');
        console.log("Instância anterior eliminada com sucesso. Memória física do navegador restaurada.");
    }
});

/**
 * Motor de Inicialização Síncrono do Emulador
 */
window.launchGame = function(system, romUrl, gameTitle) {
    document.getElementById('catalog-screen').classList.add('hidden');
    const emuScreen = document.getElementById('emulator-screen');
    emuScreen.classList.remove('hidden');
    document.getElementById('playing-title').textContent = `Jogando: ${gameTitle}`;

    const wrapper = document.getElementById('player-wrapper-target');
    wrapper.innerHTML = `<div id="emulator-player"><div id="game-canvas"></div></div>`;

    window.EJS_player = '#game-canvas';
    window.EJS_core = system; 
    window.EJS_gameUrl = romUrl; 
    window.EJS_pathtodata = 'https://cdn.emulatorjs.org/latest/data/'; 
    
    window.EJS_startOnLoaded = true; 
    window.EJS_AdUrl = ''; 
    window.EJS_myserver = 'true';

    window.EJS_disableLoadState = true; 
    window.EJS_forceLoadOnStart = true; 

    const sanitizedTitle = gameTitle.replace(/[^a-zA-Z0-9]/g, "_") + ".sav";

    // CARREGAMENTO AUTOMÁTICO
    window.EJS_onLogin = async function() {
        if (!googleAccessToken) return;

        try {
            const listUrl = `https://www.googleapis.com/drive/v3/files?q=name='${sanitizedTitle}'+and+'appDataFolder'+in+parents&spaces=appDataFolder`;
            const response = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
            const searchResult = await response.json();

            if (searchResult.files && searchResult.files.length > 0) {
                const fileId = searchResult.files[0].id;
                const downloadResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                    headers: { 'Authorization': `Bearer ${googleAccessToken}` }
                });
                const blob = await downloadResponse.blob();
                const buffer = await blob.arrayBuffer();
                
                window.EJS_LoadState(new Uint8Array(buffer));
                console.log("Progresso restaurado automaticamente!");
            }
        } catch (err) {
            console.error("Falha ao recuperar save state do Google Drive:", err);
        }
    };

    // SALVAMENTO SEGURO
    window.EJS_onSaveState = async function(data) {
        if (!googleAccessToken) {
            alert("Faça login com sua conta Google para salvar o progresso no seu Drive pessoal!");
            return;
        }

        const blob = new Blob([data], { type: "application/octet-stream" });

        try {
            const listUrl = `https://www.googleapis.com/drive/v3/files?q=name='${sanitizedTitle}'+and+'appDataFolder'+in+parents&spaces=appDataFolder`;
            const searchRes = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
            const searchData = await searchRes.json();

            if (searchData.files && searchData.files.length > 0) {
                const fileId = searchData.files[0].id;
                const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
                await fetch(updateUrl, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/octet-stream' },
                    body: blob
                });
            } else {
                const createUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
                const metadata = { name: sanitizedTitle, parents: ['appDataFolder'] };
                const formData = new FormData();
                formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                formData.append('media', blob);

                await fetch(createUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${googleAccessToken}` }, body: formData });
            }
            alert("Progresso salvo com sucesso no seu Google Drive pessoal! 💾🔥");
        } catch (err) {
            console.error("Falha ao gravar save state no Google Drive:", err);
        }
    };

    const script = document.createElement('script');
    script.src = 'https://cdn.emulatorjs.org/latest/data/loader.js';
    document.getElementById('emulator-player').appendChild(script);
};

/**
 * Processamento de Upload e Leitura de ROMs Locais
 */
window.uploadAndPlay = function() {
    const fileInput = document.getElementById('rom-upload');
    let system = document.getElementById('system-select').value;
    
    if (fileInput.files.length === 0) {
        alert("Por favor, selecione um arquivo de ROM primeiro!");
        return;
    }

    const file = fileInput.files[0];
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === 'smd' || extension === 'gen' || extension === 'md') {
        system = 'segaMD'; 
    } else if (extension === 'sms') {
        system = 'mastersystem'; 
    }

    if (activeBlobUrl) { URL.revokeObjectURL(activeBlobUrl); }
    activeBlobUrl = URL.createObjectURL(file);
    launchGame(system, activeBlobUrl, file.name);
};

/**
 * 🔥 OPERAÇÃO PURGA MÁXIMA:
 * Corta as conexões de gamepads do sistema operacional e limpa os scripts fantasmas forçando um reload limpo da página.
 */
window.closeEmulator = function() {
    console.log("Cortando conexões paralelas do WebAssembly...");
    
    // Seta a flag para o script saber que deve carregar direto na dashboard pós-refresh
    sessionStorage.setItem('emu_purge_active', 'true');
    
    // Executa a purga total limpando a memória RAM e as threads ativas de áudio/controles do navegador
    window.location.reload();
};
