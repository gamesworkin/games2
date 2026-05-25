import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// ⚠️ SUBSTITUA TODAS AS PROPRIEDADES ABAIXO PELAS CREDENCIAIS DO SEU CONSOLE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyATr3AFcjJtamWRKZEBBcsA8vi-_ckCeEs",
    authDomain: "games2-c9b04.firebaseapp.com",
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

// Manipuladores de Eventos do Painel de Autenticação
btnLogin.addEventListener('click', async () => {
    try { await signInWithPopup(auth, provider); } 
    catch (error) { console.error("Erro no fluxo de autenticação: ", error); }
});

btnLogout.addEventListener('click', () => signOut(auth));

/**
 * Motor de Inicialização Genérico do Emulador
 * Puxa os dados binários da ROM para o contexto da RAM do navegador e roda de forma isolada.
 */
window.launchGame = function(system, romUrl, gameTitle) {
    // Esconde a Dashboard e exibe a tela do emulador
    document.getElementById('catalog-screen').classList.add('hidden');
    const emuScreen = document.getElementById('emulator-screen');
    emuScreen.classList.remove('hidden');
    document.getElementById('playing-title').textContent = `Jogando: ${gameTitle}`;

    // Sanitização e limpeza de instâncias prévias do canvas do player
    document.getElementById('emulator-player').innerHTML = `<div id="game-canvas"></div>`;

    // Injeção de Parâmetros Globais requeridos na API do EmulatorJS
    window.EJS_player = '#game-canvas';
    window.EJS_core = system; 
    window.EJS_gameUrl = romUrl; 
    window.EJS_pathtodata = 'https://cdn.emulatorjs.org/latest/data/'; 
    
    // Configurações nativas para evitar tela preta no mobile e forçar o início imediato
    window.EJS_startOnLoaded = true; 
    window.EJS_AdUrl = ''; 

    // Injeção assíncrona do script Loader oficial do ecossistema EmulatorJS
    const script = document.createElement('script');
    script.src = 'https://cdn.emulatorjs.org/latest/data/loader.js';
    document.getElementById('emulator-player').appendChild(script);

    // Callback síncrono disparado no carregamento da rom para restaurar save states antigos do Firebase
    window.EJS_onLogin = async function() {
        if (!currentUser) return;
        const sanitizedTitle = gameTitle.replace(/[^a-zA-Z0-9]/g, "_");
        const saveRef = doc(db, "saves", `${currentUser.uid}_${sanitizedTitle}`);
        
        try {
            const saveSnap = await getDoc(saveRef);
            if (saveSnap.exists()) {
                window.EJS_LoadState(new Uint8Array(saveSnap.data().bytes));
                console.log("Save state restaurado com sucesso via Cloud!");
            }
        } catch (err) {
            console.error("Falha ao ler save do Firebase:", err);
        }
    };

    // Interceptador disparado pela engine do emulador no evento de escrita de Save State do Usuário
    window.EJS_onSaveState = async function(data) {
        if (!currentUser) {
            alert("Faça login com a sua conta Google para salvar o progresso do jogo na nuvem!");
            return;
        }
        
        const sanitizedTitle = gameTitle.replace(/[^a-zA-Z0-9]/g, "_");
        const saveRef = doc(db, "saves", `${currentUser.uid}_${sanitizedTitle}`);
        
        try {
            await setDoc(saveRef, {
                bytes: Array.from(data),
                updatedAt: new Date()
            });
            console.log("Estado de persistência gravado com sucesso no Firebase!");
        } catch (err) {
            console.error("Erro na gravação do save state na nuvem:", err);
        }
    };
};

/**
 * Função de Processamento para Upload de Arquivos de ROM Locais
 * Intercepta o arquivo local através da API FileReader e aloca na memória interna através de uma Blob URL
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

    // Sistema inteligente de Auto-Correção e Suporte para Extensões Alternativas (.smd, .sms, .gen)
    if (extension === 'smd' || extension === 'gen' || extension === 'md') {
        system = 'segaMD'; 
    } else if (extension === 'sms') {
        system = 'mastersystem'; 
    }

    // Se já havia uma ROM alocada anteriormente, limpa antes de gerar outra
    if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
    }

    // Cria uma URL virtual estática temporária apontando de volta para a RAM local do dispositivo do cliente
    activeBlobUrl = URL.createObjectURL(file);

    // Aciona a rotina padrão do emulador passando a referência virtual da RAM
    launchGame(system, activeBlobUrl, file.name);
};

/**
 * Finaliza a execução do Core, limpa a memória RAM e retorna o usuário à tela de seleção principal
 */
window.closeEmulator = function() {
    // 1. Destrói o Canvas e o iFrame do emulador descarregando o WebAssembly
    document.getElementById('emulator-player').innerHTML = '';
    
    // 2. Coleta de lixo da memória RAM: Revoga o link da ROM para liberar espaço no sistema operacional
    if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
        activeBlobUrl = null;
    }

    // 3. Limpa todas as instâncias e variáveis globais criadas pelo Loader da biblioteca anterior
    window.EJS_player = null;
    window.EJS_core = null;
    window.EJS_gameUrl = null;
    if (window.EJS_emulator) {
        try {
            window.EJS_emulator.destroy(); 
        } catch(e) {}
        window.EJS_emulator = null;
    }

    // 4. Alterna as telas de exibição visual da UI
    document.getElementById('emulator-screen').classList.add('hidden');
    document.getElementById('catalog-screen').classList.remove('hidden');
    console.log("Instância do jogo destruída e alocação de memória RAM liberada com sucesso.");
};
