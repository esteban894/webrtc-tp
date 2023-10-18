import "./style.css";
import firebase from "firebase/app";
import "firebase/firestore";
import Toastify from "toastify";

// credenciales de firebase para configuracion
const firebaseConfig = {
  apiKey: "AIzaSyD6mI56z0J6TgUcxqlXvrm6LJVTme6ex3M",
  authDomain: "webrtc-project-1c55d.firebaseapp.com",
  projectId: "webrtc-project-1c55d",
  storageBucket: "webrtc-project-1c55d.appspot.com",
  messagingSenderId: "104973886700",
  appId: "1:104973886700:web:f751a9ce26b27f73edf1c9",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();

// se definen un par de servidores stun con los que se puede conectar la aplicacion
const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

// se define el peer para la conexion rtc
let pc = new RTCPeerConnection(servers);
// se definen los streams para local y remoto
let localStream = null;
let remoteStream = null;

// casteo de elementos html para darles funcionalidad
const webcamButton = document.getElementById("webcamButton");
const webcamVideo = document.getElementById("webcamVideo");
const callButton = document.getElementById("callButton");
const callInput = document.getElementById("callInput");
const answerButton = document.getElementById("answerButton");
const remoteVideo = document.getElementById("remoteVideo");
const copyCodeButton = document.getElementById("copyCodeButton");

webcamButton.onclick = async () => {
  // se asignan los permisos de audio y video para localStream
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  // se define remoteStream como un objeto de tipo MediaStream para su posterior uso
  remoteStream = new MediaStream();

  // se recorren las pistas de audio y video del objeto localStream u se añaden al objeto pc
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // se define el evento ontrack se recorren todas las pistas recibidas y se añaden al objeto remoteStream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  // se asignan los objetos localStream y remoteStream a los elementos html correspondientes
  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  // se habilitan y deshabilitan los botones de ser necesario
  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

callButton.onclick = async () => {
  //creacion de documentos y collecciones en firestore
  const callDoc = firestore.collection("calls").doc();
  const offerCandidates = callDoc.collection("offerCandidates");
  const answerCandidates = callDoc.collection("answerCandidates");

  // se asigna el valor de la id del documento recien creado al input de la llamada
  callInput.value = callDoc.id;

  // se activa el boton para poder copiar el codigo de llamada
  copyCodeButton.disabled = false;

  // se define el evento onicecandidate en el objeto pc, esto se activa cuando se genera un candidato ICE
  // si se genera un candidato ICE se agrerga a la coleccion "offerCandidates" en firebase
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // creacion de la oferta y la misma se establece como descripcion
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  // almacenamiento de la oferta en firestore
  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  // se define un evento que se activa cuando hay cambios en el documento
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    // se crea una descripcion de respiesta utilizando la respiesta del documento y se asigna como descripcion remota
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // se define un evento que se activa cuando hay cambios en la coleccin answerCandidates
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      // si se agrega un documento a la coleccion se crea un candidato CIE y se agrega al objeto pc
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });
};

answerButton.onclick = async () => {
  // se obtiene el Id de la llamada desde el elemento callInput
  const callId = callInput.value;

  // se pide a firestore el elemento en base a la id de la llamada
  const callDoc = firestore.collection("calls").doc(callId);

  // se obtienen las colecciones de candidatos y ofertas
  const answerCandidates = callDoc.collection("answerCandidates");
  const offerCandidates = callDoc.collection("offerCandidates");

  // se configura el evento onicecandidate para agregar candidatos de respuesta a la coleccion
  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  //se obtienen los datos de la llamada desde el documento en firestore
  const callData = (await callDoc.get()).data();

  // se asigna la oferta a la descripcion dela oferta y se la pasa al remotepeer como descripcion
  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  // se crea la descripcion de la despuesta y se utiliza en la respuesta
  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  // se actualiza la respuesta en el documento de firestore
  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  // escucha los cambios en la coleccion de candidatos de oferta
  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === "added") {
        // se obtienen losdatos del candidato y se agrega un nuevo candidato ICE al pc
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};

// al activarse el evento click del boton se copia el codigo de la llamada al portapapeles y se muestra un mensaje
copyCodeButton.addEventListener("click", () => {
  const value = callInput.value;
  if (value != "" && value != null) {
    navigator.clipboard.writeText(value);
    Toastify.success("Copiado al portapapeles");
  } else {
    Toastify.error("No hay nada para copiar");
  }
});
