import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";

// ⚠️ SUAS CREDENCIAIS BÁSICAS DO FIREBASE (Precisa apenas do Auth ativo)
const firebaseConfig = {
    apiKey: "AIzaSyATr3AFcjJtamWRKZEBBcsA8vi-_ckCeEs",
    authDomain: "games2-c9b04.firebaseapp.com",
    projectId: "games2-c9b04",
    storageBucket: "games2-c9b04.firebasestorage.app",
    messagingSenderId: "417046305603",
    appId: "1:417046305603:web:52e921b1f10f9ed4b76df6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// 🔥 CRUCIAL: Pede permissão para acessar a pasta oculta de aplicativos no Drive do usuário
provider.addScope('https://www.googleapis.com/auth/drive.appdata');

let currentUser = null;
let googleAccessToken = null; // Token necessário para falar com o Drive dele
let activeBlobUrl = null; 

const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// Monitora o Login
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

// Login capturando o Token de Acesso do Google Drive
btnLogin.addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        // Guarda a credencial que dá acesso ao Drive do usuário
        const credential = GoogleAuthProvider.credentialFromResult(result);
        googleAccessToken = credential.accessToken;
    } catch (error) {
        console.error("Erro ao logar: ", error);
    }
});

btnLogout.addEventListener('click', () => signOut(auth));

/**
 * MOTOR DO EMULADOR - INTEGRAÇÃO DIRETA COM GOOGLE DRIVE PESSOAL
 */
window.launchGame = function(system, romUrl, gameTitle) {
    document.getElementById('catalog-screen').classList.add('hidden');
    const emuScreen = document.getElementById('emulator-screen');
    emuScreen.classList.remove('hidden');
    document.getElementById('playing-title').textContent = `Jogando: ${gameTitle}`;

    document.getElementById('emulator-player').innerHTML = `<div id="game-canvas"></div>`;

    window.EJS_player = '#game-canvas';
    window.EJS_core = system; 
    window.EJS_gameUrl = romUrl; 
    window.EJS_pathtodata = 'https://cdn.emulatorjs.org/latest/data/'; 
    window.EJS_startOnLoaded = true; 
    window.EJS_AdUrl = ''; 
    window.EJS_myserver = 'true';

    const sanitizedTitle = gameTitle.replace(/[^a-zA-Z0-9]/g, "_") + ".sav";

    // BUSCAR SAVE NO GOOGLE DRIVE DO USUÁRIO
    window.EJS_onLogin = async function() {
        if (!googleAccessToken) return;
        console.log("Buscando save state na conta Google do jogador...");

        try {
            // 1. Procura se o arquivo já existe na pasta do app do usuário
            const listUrl = `https://www.googleapis.com/drive/v3/files?q=name='${sanitizedTitle}'+and+'appDataFolder'+in+parents&spaces=appDataFolder`;
            const response = await fetch(listUrl, {
                headers: { 'Authorization': `Bearer ${googleAccessToken}` }
            });
            const data = await response.json();

            if (data.files && data.files.length > 0) {
                const fileId = data.files[0].id;
                // 2. Se o arquivo existe, baixa os bytes brutos dele
                const downloadResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                    headers: { 'Authorization': `Bearer ${googleAccessToken}` }
                });
                const blob = await downloadResponse.blob();
                const buffer = await blob.arrayBuffer();
                
                window.EJS_LoadState(new Uint8Array(buffer));
                console.log("Progresso recuperado do Google Drive do próprio usuário!");
            }
        } catch (err) {
            console.error("Erro ao buscar no Google Drive:", err);
        }
    };

    // SALVAR PROGRESSO DIRETAMENTE NO GOOGLE DRIVE DO USUÁRIO
    window.EJS_onSaveState = async function(data) {
        if (!googleAccessToken) {
            alert("Faça login com sua conta Google para salvar o progresso no seu Drive!");
            return;
        }

        console.log("Enviando save state para o Google Drive do jogador...");
        const blob = new Blob([data], { type: "application/octet-stream" });

        try {
            // 1. Verifica se o arquivo já existe para decidir se cria ou atualiza
            const listUrl = `https://www.googleapis.com/drive/v3/files?q=name='${sanitizedTitle}'+and+'appDataFolder'+in+parents&spaces=appDataFolder`;
            const searchRes = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
            const searchData = await searchRes.json();

            let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
            let method = 'POST';

            const metadata = { name: sanitizedTitle };

            if (searchData.files && searchData.files.length > 0) {
                // Se já existe, atualiza o arquivo antigo (PUT)
                const fileId = searchData.files[0].id;
                uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
                method = 'PATCH';
                
                // Upload simplificado para atualização
                await fetch(uploadUrl, {
                    method: method,
                    headers: { 'Authorization': `Bearer ${googleAccessToken}`, 'Content-Type': 'application/octet-stream' },
                    body: blob
                });
            } else {
                // Se é um save novo, cria dentro da 'appDataFolder'
                metadata.parents = ['appDataFolder'];
                
                const formData = new FormData();
                formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                formData.append('media', blob);

                await fetch(uploadUrl, {
                    method: method,
                    headers: { 'Authorization': `Bearer ${googleAccessToken}` },
                    body: formData
                });
            }

            console.log("Salvo com sucesso no Drive do usuário!");
            alert("Progresso salvo no seu Google Drive pessoal! 💾");
        } catch (err) {
            console.error("Erro ao salvar no Google Drive:", err);
            alert("Erro ao salvar no seu Drive: " + err.message);
        }
    };

    const script = document.createElement('script');
    script.src = 'https://cdn.emulatorjs.org/latest/data/loader.js';
    document.getElementById('emulator-player').appendChild(script);
};

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

window.closeEmulator = function() {
    document.getElementById('emulator-player').innerHTML = '';
    if (activeBlobUrl) { URL.revokeObjectURL(activeBlobUrl); activeBlobUrl = null; }
    window.EJS_player = null; window.EJS_core = null; window.EJS_gameUrl = null;
    if (window.EJS_emulator) { try { window.EJS_emulator.destroy(); } catch(e) {} window.EJS_emulator = null; }
    document.getElementById('emulator-screen').classList.add('hidden');
    document.getElementById('catalog-screen').classList.remove('hidden');
};
