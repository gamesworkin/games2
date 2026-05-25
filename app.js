import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";

// ⚠️ SUBSTITUA PELAS CREDENCIAIS DO SEU CONSOLE FIREBASE (Apenas o recurso Auth será consumido)
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

// 🔥 SOLICITAÇÃO DE ESCOPO: Permite ao site ler e gravar na pasta oculta do app no Drive do próprio usuário
provider.addScope('https://www.googleapis.com/auth/drive.appdata');

let currentUser = null;
let googleAccessToken = null; // Guardará a chave de acesso temporária para manipular a API do Drive do jogador
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
        // Extração do Token do Google Drive correspondente a essa sessão autenticada
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
    
    // Configurações Mobile Seguras e Inicialização Direta
    window.EJS_startOnLoaded = true; 
    window.EJS_AdUrl = ''; 
    window.EJS_myserver = 'true';

    // 🛠️ CORREÇÃO DE MENUS CONFLITANTES:
    // Remove o botão nativo "Carregar da nuvem" para evitar janelas de upload desnecessárias, 
    // já que o nosso script faz o Load Automático assim que o jogo liga.
    window.EJS_disableLoadState = true; 
    window.EJS_forceLoadOnStart = true; 

    const sanitizedTitle = gameTitle.replace(/[^a-zA-Z0-9]/g, "_") + ".sav";

    // CARREGAMENTO AUTOMÁTICO (RAM <- GOOGLE DRIVE DO JOGADOR)
    window.EJS_onLogin = async function() {
        console.log("Iniciando varredura automatizada na conta Google Drive do jogador...");
        if (!googleAccessToken) {
            console.log("Nenhum usuário logado. O progresso não será carregado da nuvem.");
            return;
        }

        try {
            // 1. Consulta se o arquivo .sav já existe dentro da pasta oculta appDataFolder do jogador
            const listUrl = `https://www.googleapis.com/drive/v3/files?q=name='${sanitizedTitle}'+and+'appDataFolder'+in+parents&spaces=appDataFolder`;
            const response = await fetch(listUrl, {
                headers: { 'Authorization': `Bearer ${googleAccessToken}` }
            });
            const searchResult = await response.json();

            if (searchResult.files && searchResult.files.length > 0) {
                const fileId = searchResult.files[0].id;
                console.log(`Save localizado (ID: ${fileId}). Puxando os dados binários da nuvem...`);
                
                // 2. Faz o download do binário puro correspondente ao save state
                const downloadResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                    headers: { 'Authorization': `Bearer ${googleAccessToken}` }
                });
                const blob = await downloadResponse.blob();
                const buffer = await blob.arrayBuffer();
                
                // 3. Injeta a sequência numérica diretamente na RAM do emulador
                window.EJS_LoadState(new Uint8Array(buffer));
                console.log("Progresso restaurado automaticamente de forma síncrona!");
            } else {
                console.log("Nenhum progresso prévio localizado no Google Drive para esta ROM.");
            }
        } catch (err) {
            console.error("Falha ao recuperar save state do Google Drive:", err);
        }
    };

    // SALVAMENTO SEGURO (RAM -> GOOGLE DRIVE DO JOGADOR)
    window.EJS_onSaveState = async function(data) {
        console.log("Interceptando gatilho de persistência gerado pelo emulador...");
        if (!googleAccessToken) {
            alert("Faça login com sua conta Google para salvar o progresso no seu Drive pessoal!");
            return;
        }

        // Compacta o array numérico da memória RAM em um objeto Blob binário nativo (.sav)
        const blob = new Blob([data], { type: "application/octet-stream" });

        try {
            // 1. Varre se o arquivo de save já existe para diferenciar um Create (POST) de um Update (PATCH)
            const listUrl = `https://www.googleapis.com/drive/v3/files?q=name='${sanitizedTitle}'+and+'appDataFolder'+in+parents&spaces=appDataFolder`;
            const searchRes = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
            const searchData = await searchRes.json();

            if (searchData.files && searchData.files.length > 0) {
                // Cenário A: Atualizar save antigo existente (PATCH) - Sem limites de 1MB!
                const fileId = searchData.files[0].id;
                const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
                
                await fetch(updateUrl, {
                    method: 'PATCH',
                    headers: { 
                        'Authorization': `Bearer ${googleAccessToken}`, 
                        'Content-Type': 'application/octet-stream' 
                    },
                    body: blob
                });
                console.log("Documento atualizado com sucesso no Google Drive do jogador.");
            } else {
                // Cenário B: Criar um arquivo de save inédito na pasta reservada do app (POST)
                const createUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
                const metadata = { name: sanitizedTitle, parents: ['appDataFolder'] };
                
                const formData = new FormData();
                formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                formData.append('media', blob);

                await fetch(createUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${googleAccessToken}` },
                    body: formData
                });
                console.log("Novo documento gerado dentro da appDataFolder do jogador.");
            }

            alert("Progresso salvo com sucesso no seu Google Drive pessoal! 💾🔥");
        } catch (err) {
            console.error("Falha ao gravar save state no Google Drive:", err);
            alert("Erro ao gravar dados no seu Drive: " + err.message);
        }
    };

    // Injeção do Script do Motor Gráfico Core após os mapeamentos preventivos estarem declarados
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
 * Finaliza a Execução e Coleta o Lixo da memória RAM
 */
window.closeEmulator = function() {
    document.getElementById('emulator-player').innerHTML = '';
    if (activeBlobUrl) { URL.revokeObjectURL(activeBlobUrl); activeBlobUrl = null; }
    window.EJS_player = null; window.EJS_core = null; window.EJS_gameUrl = null;
    if (window.EJS_emulator) { try { window.EJS_emulator.destroy(); } catch(e) {} window.EJS_emulator = null; }
    document.getElementById('emulator-screen').classList.add('hidden');
    document.getElementById('catalog-screen').classList.remove('hidden');
};
