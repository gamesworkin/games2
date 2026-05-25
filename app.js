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

// Solicitação de Escopo para o Google Drive do usuário
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
    } else {
        currentUser = null;
        googleAccessToken = null;
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
        console.log("Token do Google Drive obtido com sucesso!");
    } catch (error) {
        console.error("Erro no fluxo de login: ", error);
    }
});

btnLogout.addEventListener('click', () => signOut(auth));

/**
 * Motor de Inicialização Síncrono do Emulador
 */
window.launchGame = function(system, romUrl, gameTitle) {
    document.getElementById('catalog-screen').classList.add('hidden');
    const emuScreen = document.getElementById('emulator-screen');
    emuScreen.classList.remove('hidden');
    document.getElementById('playing-title').textContent = `Jogando: ${gameTitle}`;

    // Descarrega qualquer canvas ou frame remanescente
    document.getElementById('emulator-player').innerHTML = `<div id="game-canvas"></div>`;

    // Parâmetros estruturais obrigatórios do EmulatorJS
    window.EJS_player = '#game-canvas';
    window.EJS_core = system; 
    window.EJS_gameUrl = romUrl; 
    window.EJS_pathtodata = 'https://cdn.emulatorjs.org/latest/data/'; 
    
    window.EJS_startOnLoaded = true; 
    window.EJS_AdUrl = ''; 
    window.EJS_myserver = 'true';

    // Desativa botões confusos e força o auto-load
    window.EJS_disableLoadState = true; 
    window.EJS_forceLoadOnStart = true; 

    const sanitizedTitle = gameTitle.replace(/[^a-zA-Z0-9]/g, "_") + ".sav";

    // CARREGAMENTO AUTOMÁTICO
    window.EJS_onLogin = async function() {
        console.log("Iniciando varredura automatizada na conta Google Drive do jogador...");
        if (!googleAccessToken) {
            console.log("Nenhum usuário logado. O progresso não será carregado da nuvem.");
            return;
        }

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
        console.log("Interceptando gatilho de persistência gerado pelo emulador...");
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
            alert("Erro ao gravar dados no seu Drive: " + err.message);
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
 * ⚡ SOLUÇÃO DO PROBLEMA: Interrompe o áudio, limpa o WASM e expulsa o jogo da RAM imediatamente
 */
window.closeEmulator = function() {
    console.log("Iniciando processo de encerramento forçado do jogo...");

    // 1. SILENCIA O SOM: Força o fechamento imediato do gerenciador de áudio do navegador criado pelo emulador
    if (window.EJS_emulator && window.EJS_emulator.gameManager) {
        try {
            const module = window.EJS_emulator.gameManager.getModule();
            if (module && module.audioContext) {
                module.audioContext.close();
                console.log("Contexto de áudio da thread WASM encerrado.");
            }
        } catch (e) {
            console.log("Nota: Contexto de áudio já estava inativo.");
        }
    }

    // 2. DESTRÓI O EMULADOR: Chama o destruidor nativo do EmulatorJS para finalizar loops WebGL/WASM
    if (window.EJS_emulator) {
        try { 
            window.EJS_emulator.destroy(); 
            console.log("Instância ativa do EmulatorJS destruída.");
        } catch(e) {
            console.warn("Erro ao invocar o método destroy nativo, limpando manualmente...");
        }
        window.EJS_emulator = null;
    }

    // 3. LIMPEZA DOS ELEMENTOS: Limpa o HTML removendo frames e canvas internos
    document.getElementById('emulator-player').innerHTML = '';

    // 4. LIBERAÇÃO DA MEMÓRIA RAM: Coleta de lixo do arquivo Blob criado no upload local
    if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
        activeBlobUrl = null;
        console.log("Espaço alocado pela ROM na memória RAM liberado.");
    }

    // 5. APAGA AS CHAVES GLOBAIS: Impede que o próximo jogo sofra conflito com metadados do jogo anterior
    window.EJS_player = null;
    window.EJS_core = null;
    window.EJS_gameUrl = null;
    window.EJS_onLogin = null;
    window.EJS_onSaveState = null;

    // Alterna a interface visual de volta para a Home
    document.getElementById('emulator-screen').classList.add('hidden');
    document.getElementById('catalog-screen').classList.remove('hidden');
    console.log("Processo concluído. Sistema de memória limpo para o próximo jogo! ⚡");
};
