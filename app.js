import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// ⚠️ SUBSTITUA TODAS AS PROPRIEDADES ABAIXO PELAS CREDENCIAIS DO SEU CONSOLE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyATr3AFcjJtamWRKZEBBcsA8vi-_ckCeEs",
  authDomain: "games2-c9b04.firebaseapp.com",
  databaseURL: "https://games2-c9b04-default-rtdb.firebaseio.com",
  projectId: "games2-c9b04",
  storageBucket: "games2-c9b04.firebasestorage.app",
  messagingSenderId: "417046305603",
  appId: "1:417046305603:web:52e921b1f10f9ed4b76df6"
};

// Inicialização das APIs do Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let activeBlobUrl = null; 

// Captura de Elementos do DOM
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');

// Listener de Autenticação - Gerencia Sessão do Usuário Ativo
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        btnLogin.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userAvatar.src = user.photoURL;
        userName.textContent = user.displayName.split(' ')[0];
    } else {
        currentUser = null;
        btnLogin.classList.remove('hidden');
        userInfo.classList.add('hidden');
    }
});

// Manipuladores de Eventos do Panel de Autenticação
btnLogin.addEventListener('click', async () => {
    try { await signInWithPopup(auth, provider); } 
    catch (error) { console.error("Erro no fluxo de autenticação: ", error); }
});

btnLogout.addEventListener('click', () => signOut(auth));

/**
 * Motor de Inicialização Genérico do Emulador
 */
window.launchGame = function(system, romUrl, gameTitle) {
    // Esconde a Dashboard e exibe a tela do emulador
    document.getElementById('catalog-screen').classList.add('hidden');
    const emuScreen = document.getElementById('emulator-screen');
    emuScreen.classList.remove('hidden');
    document.getElementById('playing-title').textContent = `Jogando: ${gameTitle}`;

    // Sanitização e limpeza de instâncias prévias do canvas do player
    document.getElementById('emulator-player').innerHTML = `<div id="game-canvas"></div>`;

    // 1. Injeção das Configurações Globais (PRECISAM VIR ANTES DO SCRIPT DO EMULADOR)
    window.EJS_player = '#game-canvas';
    window.EJS_core = system; 
    window.EJS_gameUrl = romUrl; 
    window.EJS_pathtodata = 'https://cdn.emulatorjs.org/latest/data/'; 
    
    window.EJS_startOnLoaded = true; 
    window.EJS_AdUrl = ''; 

    // Força o emulador a entender que o sistema de login/nuvem está ativo no site externo
    window.EJS_myserver = 'true';

    // 2. DECLARAÇÃO DOS INTERCEPTADORES (Definidos ANTES do loader para o emulador escutá-los)
    
    // Disparado assim que a ROM carrega para buscar o save na nuvem
    window.EJS_onLogin = async function() {
        console.log("EmulatorJS carregado. Verificando persistência de nuvem...");
        if (!currentUser) {
            console.log("Nenhum usuário logado. Ignorando busca de save states.");
            return;
        }
        const sanitizedTitle = gameTitle.replace(/[^a-zA-Z0-9]/g, "_");
        const saveRef = doc(db, "saves", `${currentUser.uid}_${sanitizedTitle}`);
        
        try {
            const saveSnap = await getDoc(saveRef);
            if (saveSnap.exists()) {
                window.EJS_LoadState(new Uint8Array(saveSnap.data().bytes));
                console.log("Save state recuperado do Firestore e injetado na RAM!");
            } else {
                console.log("Nenhum save state prévio encontrado para este jogo.");
            }
        } catch (err) {
            console.error("Falha ao ler save do Firebase:", err);
        }
    };

    // Interceptador disparado TODA VEZ que você clica em salvar dentro do menu do emulador
    window.EJS_onSaveState = async function(data) {
        console.log("Evento onSaveState detectado pelo JavaScript!");
        if (!currentUser) {
            alert("Faça login com a sua conta Google para salvar o progresso do jogo na nuvem!");
            return;
        }
        
        const sanitizedTitle = gameTitle.replace(/[^a-zA-Z0-9]/g, "_");
        const saveRef = doc(db, "saves", `${currentUser.uid}_${sanitizedTitle}`);
        
        try {
            // Salva ou sobrescreve o documento de forma assíncrona
            await setDoc(saveRef, {
                bytes: Array.from(data),
                updatedAt: new Date()
            });
            console.log("Estado gravado com sucesso no Cloud Firestore!");
            alert("Progresso salvo com sucesso na nuvem! 🔥");
        } catch (err) {
            console.error("Erro na gravação do save state na nuvem:", err);
            alert("Erro ao salvar na nuvem: " + err.message);
        }
    };

    // 3. INJEÇÃO DO SCRIPT LOADER (Agora que tudo está configurado, o script inicia com segurança)
    const script = document.createElement('script');
    script.src = 'https://cdn.emulatorjs.org/latest/data/loader.js';
    document.getElementById('emulator-player').appendChild(script);
};

/**
 * Função de Processamento para Upload de Arquivos de ROM Locais
 */
window.uploadAndPlay = function() {
    const fileInput = document.getElementById('rom-upload');
    let system = document.getElementById('system-select').value;
    
    if (fileInput.files.length === 0) {
        alert("Por favor, selecione um arquivo de ROM primeiro clicando no botão apropriado!");
        return;
    }

    const file = fileInput.files[0];
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === 'smd' || extension === 'gen' || extension === 'md') {
        system = 'segaMD'; 
    } else if (extension === 'sms') {
        system = 'mastersystem'; 
    }

    if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
    }

    activeBlobUrl = URL.createObjectURL(file);
    launchGame(system, activeBlobUrl, file.name);
};

/**
 * Finaliza a execução do Core e limpa a memória
 */
window.closeEmulator = function() {
    document.getElementById('emulator-player').innerHTML = '';
    
    if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
        activeBlobUrl = null;
    }

    window.EJS_player = null;
    window.EJS_core = null;
    window.EJS_gameUrl = null;
    if (window.EJS_emulator) {
        try { window.EJS_emulator.destroy(); } catch(e) {}
        window.EJS_emulator = null;
    }

    document.getElementById('emulator-screen').classList.add('hidden');
    document.getElementById('catalog-screen').classList.remove('hidden');
    console.log("Instância do jogo destruída e alocação de memória RAM liberada.");
};
