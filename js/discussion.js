/* L'interlocuteur — le pont vers l'API d'Anthropic.
   Ce fichier ne connaît rien de l'appli : on lui donne un sujet, un rôle et les
   échanges déjà dits, il rend ce que l'autre répond, mot à mot.
   La clé vit dans le localStorage de cet appareil, sous sa propre entrée : elle
   n'entre jamais dans l'export des fiches et ne part qu'à api.anthropic.com. */
(function(){
  "use strict";

  var CLE_API    = "atelier-du-rien.cle";
  var CLE_MODELE  = "atelier-du-rien.modele";
  var CLE_VOIX    = "atelier-du-rien.voix";
  var CLE_DEPENSE = "atelier-du-rien.depense";
  var URL_API     = "https://api.anthropic.com/v1/messages";
  var MODELE_PAR_DEFAUT = "claude-sonnet-5-5";
  var TOURS_ENVOYES = 24;   // on ne renvoie que la fin de la discussion

  // `reglage` part avec chaque demande. Le vif ne réfléchit pas avant de parler
  // (« between_tools ») : pour trois phrases c'est du temps et des jetons pour rien,
  // et c'est ce qui le faisait rendre des réponses vides. Le profond, lui, réfléchit.
  // `tarif` : dollars par million de jetons, relevés sur platform.claude.com le 27/10/2026.
  var MODELES = [
    {
      id:"claude-sonnet-5-5", nom:"Vif", note:"répond vite, bon pour enchaîner",
      reglage:{thinking:{type:"between_tools"}, output_config:{effort:"low"}},
      tarif:{entree:2, sortie:10}
    },
    {
      id:"claude-opus-5-5", nom:"Profond", note:"creuse plus loin, répond plus lentement",
      reglage:{output_config:{effort:"medium"}},
      tarif:{entree:4, sortie:20}
    }
  ];
  function leModele(id){
    for(var i = 0; i < MODELES.length; i++) if(MODELES[i].id === id) return MODELES[i];
    return MODELES[0];
  }

  /* ---------- les quatre interlocuteurs ---------- */
  var ROLES = [
    {
      id:"intervieweur",
      nom:"L'intervieweur",
      resume:"Bienveillant et tenace : il repose la question quand tu réponds à côté.",
      consigne:"Tu mènes l'entretien et tu veux qu'il soit bon. Bienveillant, tenace, jamais " +
        "flatteur. Quand il répond à côté, tu reposes la même question, autrement. Quand il " +
        "généralise, tu demandes un exemple précis, vécu, daté. Quand il lâche un mot fort sans " +
        "le développer, tu reviens dessus au tour suivant. Tu ne complimentes pas : tu creuses."
    },
    {
      id:"chercheur",
      nom:"Le chercheur",
      resume:"Il a tout lu et te répond par les maîtres. À toi de démonter l'autorité.",
      consigne:"Tu cherches depuis quinze ans. Tu as lu Nisargadatta, Tolle, Mooji, tu as fait " +
        "trois retraites, tu as un professeur que tu respectes. Quand il attaque une croyance, tu " +
        "la défends avec une citation ou avec ce que ton professeur t'a dit, et ça te coûte un peu " +
        "qu'on y touche. Tu es sincère, jamais de mauvaise foi : si une réponse te déplace " +
        "vraiment, tu le reconnais, et tu demandes alors ce qu'il faut en faire."
    },
    {
      id:"sceptique",
      nom:"Le sceptique",
      resume:"Imperméable au joli : il demande ce que ça change, concrètement.",
      consigne:"Tu ne crois pas un mot de ce vocabulaire. Tu trouves que ça ressemble à du vide " +
        "bien habillé, et que ça sert surtout à vendre des stages. Tu n'es pas agressif, tu es " +
        "imperméable au joli : tu ramènes tout à « concrètement, ça change quoi, lundi matin ? ». " +
        "Tu relèves chaque formule qui sonne bien sans rien dire. Si une réponse tient debout, tu " +
        "l'admets sans cérémonie, et tu passes à l'objection suivante."
    },
    {
      id:"use",
      nom:"Celui qui en bave",
      resume:"Il ne débat pas : il raconte où il en est et attend quelque chose de toi.",
      consigne:"Tu ne débats de rien. Tu racontes où tu en es : tu as essayé, longtemps, ça n'a " +
        "pas marché, tu es fatigué. Tu réponds à ce qu'il dit par ce que ça te fait, pas par une " +
        "objection. Tu ne veux pas de théorie, tu veux savoir quoi faire demain matin. Tu ne joues " +
        "pas la détresse : tu es sobre, un peu usé, parfois tu as de l'humour."
    }
  ];

  function role(id){
    for(var i = 0; i < ROLES.length; i++) if(ROLES[i].id === id) return ROLES[i];
    return ROLES[0];
  }

  /* ---------- la clé et le modèle, sur cet appareil ---------- */
  function lire(k){ try{ return window.localStorage.getItem(k) || ""; }catch(e){ return ""; } }
  function ecrire(k, v){
    try{ if(v) window.localStorage.setItem(k, v); else window.localStorage.removeItem(k); return true; }
    catch(e){ return false; }
  }
  var cle = {
    lire:     function(){ return lire(CLE_API).trim(); },
    ecrire:   function(v){ return ecrire(CLE_API, String(v || "").trim()); },
    oublier:  function(){ return ecrire(CLE_API, ""); },
    presente: function(){ return !!lire(CLE_API).trim(); },
    // De quoi la reconnaître sans l'afficher : sk-ant-…4 derniers.
    apercu:   function(){
      var v = lire(CLE_API).trim();
      if(!v) return "";
      return v.slice(0, 7) + "…" + v.slice(-4);
    }
  };
  var modele = {
    lire:   function(){
      var v = lire(CLE_MODELE);
      for(var i = 0; i < MODELES.length; i++) if(MODELES[i].id === v) return v;
      return MODELE_PAR_DEFAUT;
    },
    ecrire: function(v){ return ecrire(CLE_MODELE, v); }
  };

  /* ---------- ce que ça coûte ---------- */
  // Anthropic ne publie aucun endpoint pour lire le solde d'un compte : l'Admin API,
  // seule à parler d'argent, est fermée aux comptes individuels et ne donne de toute
  // façon que le dépensé. On compte donc nous-mêmes, à partir des jetons que chaque
  // réponse déclare. Le chiffre d'Anthropic reste celui de la page Cost de la console.
  function depenseVide(){ return {debut:new Date().toISOString().slice(0,10), credit:0, modeles:{}, tours:0}; }
  var depense = {
    lire: function(){
      try{
        var d = JSON.parse(lire(CLE_DEPENSE) || "null");
        if(!d || typeof d !== "object") return depenseVide();
        if(!d.modeles || typeof d.modeles !== "object") d.modeles = {};
        d.credit = Number(d.credit) || 0;
        d.tours = Number(d.tours) || 0;
        if(!d.debut) d.debut = depenseVide().debut;
        return d;
      }catch(e){ return depenseVide(); }
    },
    poser: function(d){ return ecrire(CLE_DEPENSE, JSON.stringify(d)); },
    ajouter: function(id, u){
      if(!u) return;
      var d = depense.lire();
      var m = d.modeles[id] || {entree:0, sortie:0};
      m.entree += Number(u.entree) || 0;
      m.sortie += Number(u.sortie) || 0;
      d.modeles[id] = m;
      d.tours += 1;
      depense.poser(d);
    },
    credit: function(v){
      var d = depense.lire();
      d.credit = Math.max(0, Number(v) || 0);
      depense.poser(d);
    },
    remettre: function(){
      var d = depenseVide();
      d.credit = depense.lire().credit;   // le crédit chargé ne bouge pas
      depense.poser(d);
    },
    // en dollars, à partir des tarifs par million de jetons
    dollars: function(){
      var d = depense.lire(), total = 0;
      Object.keys(d.modeles).forEach(function(id){
        var t = leModele(id).tarif, m = d.modeles[id];
        total += (m.entree / 1e6) * t.entree + (m.sortie / 1e6) * t.sortie;
      });
      return total;
    }
  };

  /* ---------- la voix : il lit ses réponses ---------- */
  // Rien ne part sur un serveur ici : c'est le moteur de parole du téléphone.
  var synth = window.speechSynthesis || null;
  var voixFr = null;
  function choisirVoix(){
    if(!synth) return;
    var toutes = [];
    try{ toutes = synth.getVoices() || []; }catch(e){ return; }
    var fr = toutes.filter(function(v){ return /^fr/i.test(v.lang || ""); });
    // on préfère une voix installée sur l'appareil : pas de réseau, pas d'attente
    voixFr = fr.filter(function(v){ return v.localService; })[0] || fr[0] || null;
  }
  if(synth){
    choisirVoix();
    try{ synth.addEventListener("voiceschanged", choisirVoix); }catch(e){}
  }
  var voix = {
    possible: function(){ return !!synth && typeof window.SpeechSynthesisUtterance === "function"; },
    active:   function(){ return lire(CLE_VOIX) === "1"; },
    poser:    function(v){ return ecrire(CLE_VOIX, v ? "1" : ""); },
    taire:    function(){ if(synth) try{ synth.cancel(); }catch(e){} },
    dire:     function(t){
      if(!voix.possible() || !t) return;
      try{
        synth.cancel();
        var u = new window.SpeechSynthesisUtterance(String(t));
        if(voixFr) u.voice = voixFr;
        u.lang = (voixFr && voixFr.lang) || "fr-FR";
        u.rate = 1; u.pitch = 1;
        synth.speak(u);
      }catch(e){}
    }
  };

  /* ---------- la dictée : tu réponds à voix haute ---------- */
  // Sur iPhone, la reconnaissance passe par Apple, comme le micro du clavier.
  var Reco = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var micro = {
    possible: function(){ return !!Reco; },
    // ecouter({surTexte(acquis, partiel), surFin(acquis), surErreur(msg)}) -> {arreter()}
    ecouter: function(o){
      if(!Reco) return null;
      var r;
      try{ r = new Reco(); }catch(e){ return null; }
      r.lang = "fr-FR";
      r.continuous = true;
      r.interimResults = true;
      var acquis = "";
      r.onresult = function(ev){
        var partiel = "";
        for(var i = ev.resultIndex; i < ev.results.length; i++){
          var m = ev.results[i][0].transcript;
          if(ev.results[i].isFinal) acquis += (acquis ? " " : "") + String(m).trim();
          else partiel += m;
        }
        o.surTexte(acquis, partiel.trim());
      };
      r.onerror = function(ev){
        var c = ev && ev.error;
        if(c === "aborted") return;
        if(c === "not-allowed" || c === "service-not-allowed") o.surErreur("Micro refusé : autorise-le pour ce site.");
        else if(c === "no-speech") o.surErreur("Rien entendu.");
        else if(c === "audio-capture") o.surErreur("Aucun micro trouvé.");
        else o.surErreur("La dictée s'est arrêtée.");
      };
      r.onend = function(){ o.surFin(acquis); };
      try{ r.start(); }catch(e){ return null; }
      return {arreter:function(){ try{ r.stop(); }catch(e){} }};
    }
  };

  /* ---------- la consigne ---------- */
  // Le premier tour est toujours de lui : l'API veut un message « user » en tête,
  // alors on lui glisse celui-ci, qui ne s'affiche jamais dans le fil.
  var OUVERTURE = "On commence. Lance la discussion sur ce sujet : une question, une objection, " +
    "ou dis simplement où tu en es. Deux phrases, pas plus.";

  function consigne(sujet, r){
    var temps = (sujet.temps || []).filter(function(x){ return x && String(x).trim(); });
    var h = [];
    h.push("Tu discutes avec Fabien. Il prépare une vidéo pour sa chaîne YouTube « Les " +
           "enseignements de rien », où il démystifie la spiritualité : il reprend ce qu'on " +
           "raconte sur l'éveil, la méditation, les maîtres, et il le ramène au sol.");
    h.push("Vous ne parlez que de ce sujet-là.");
    h.push("Titre : " + (sujet.titre || "(sans titre)"));
    if(sujet.croyance)     h.push("Ce qu'on croit d'ordinaire : " + sujet.croyance);
    if(sujet.retournement) h.push("Ce qu'il veut dire à la place : " + sujet.retournement);
    if(temps.length)       h.push("Les trois temps qu'il compte tenir : " +
                                  temps.map(function(x, i){ return (i+1) + ". " + x; }).join("  "));
    h.push("Qui tu es : " + r.consigne);
    h.push([
      "Comment tu parles :",
      "- Tu es une personne, pas un assistant. Pas de « bonne question », pas de « ce que tu dis est juste », pas de résumé de ce qu'il vient de dire.",
      "- Deux ou trois phrases, jamais plus. Du français parlé, comme à voix haute.",
      "- Une seule idée par tour, et tu finis presque toujours par une relance.",
      "- Tu ne donnes jamais la réponse à sa place, même si tu la connais : c'est en te répondant qu'il la trouve.",
      "- S'il esquive, tu le dis et tu reposes la question autrement.",
      "- S'il emploie un mot de métier (ego, présence, conscience, lâcher-prise, mental), tu demandes ce que ça veut dire concrètement.",
      "- Pas de liste, pas de titre, pas d'emoji, pas de gras.",
      "- Tutoie-le. Reste dans ton personnage ; s'il te demande explicitement d'en sortir, tu peux, une phrase, puis tu y retournes."
    ].join("\n"));
    return h.join("\n\n");
  }

  function messages(echanges){
    var m = [{role:"user", content:OUVERTURE}];
    (echanges || []).forEach(function(e){
      if(!e || !e.t || (e.r !== "u" && e.r !== "a")) return;   // les bascules de rôle ne partent pas
      var r = e.r === "u" ? "user" : "assistant";
      if(m.length && m[m.length-1].role === r) m[m.length-1].content += "\n\n" + e.t;
      else m.push({role:r, content:e.t});
    });
    if(m.length > TOURS_ENVOYES){
      // on garde l'ouverture en tête, sinon l'API refuse
      m = [m[0]].concat(m.slice(-(TOURS_ENVOYES - 1)));
      if(m[1] && m[1].role === "user") m[1].content = "(…) " + m[1].content;
    }
    return m;
  }

  /* ---------- le réseau ---------- */
  function texteErreur(statut, corps){
    var dit = "";
    try{ var d = JSON.parse(corps); dit = (d && d.error && d.error.message) || ""; }catch(e){}
    if(statut === 401 || statut === 403)
      return "Cette clé n'est pas acceptée. Vérifie-la dans « L'interlocuteur ».";
    if(statut === 429)
      return "Trop de demandes d'un coup. Laisse passer quelques secondes.";
    if(statut >= 500)
      return "L'API ne répond pas pour l'instant. Réessaie dans un moment.";
    if(dit) return dit;
    return "La demande a été refusée (" + statut + ").";
  }

  // Le flux arrive en « server-sent events » : des lignes « data: {…} » séparées par du vide.
  // On rend {texte, pense, arret} : « pense » compte ce qu'il a rédigé en coulisse (bloc
  // « thinking »), « arret » dit pourquoi il s'est tu. Les deux servent quand le texte est vide.
  function lireFlux(reponse, surTexte){
    var lect = reponse.body.getReader(), dec = new TextDecoder();
    var reste = "", texte = "", pense = 0, arret = "", souci = null;
    var usage = {entree:0, sortie:0};
    return (function suite(){
      return lect.read().then(function(p){
        if(p.done) return {texte:texte, pense:pense, arret:arret, usage:usage};
        reste += dec.decode(p.value, {stream:true});
        var lignes = reste.split("\n");
        reste = lignes.pop();
        lignes.forEach(function(l){
          if(l.indexOf("data:") !== 0) return;
          var brut = l.slice(5).trim();
          if(!brut || brut === "[DONE]") return;
          var ev;
          try{ ev = JSON.parse(brut); }catch(e){ return; }
          if(ev.type === "content_block_delta" && ev.delta){
            if(typeof ev.delta.text === "string"){
              texte += ev.delta.text;
              surTexte(texte);
            } else if(typeof ev.delta.thinking === "string"){
              pense += ev.delta.thinking.length;
            }
          } else if(ev.type === "message_start" && ev.message && ev.message.usage){
            usage.entree += Number(ev.message.usage.input_tokens) || 0;
          } else if(ev.type === "message_delta"){
            if(ev.delta && ev.delta.stop_reason) arret = ev.delta.stop_reason;
            if(ev.usage) usage.sortie = Number(ev.usage.output_tokens) || usage.sortie;
          } else if(ev.type === "error"){
            souci = (ev.error && ev.error.message) || "La réponse s'est interrompue.";
          }
        });
        if(souci) throw new Error(souci);
        return suite();
      });
    })();
  }

  // Quand il n'a rien dit, on dit au moins pourquoi plutôt que « vide ».
  function pourquoiRien(res){
    if(res.arret === "max_tokens"){
      return res.pense
        ? "Il a tourné en rond dans sa tête et n'a rien dit. Réessaie."
        : "Sa réponse a été coupée avant le premier mot. Réessaie.";
    }
    if(res.arret === "refusal") return "Il a refusé de répondre à ce tour-là. Reformule, ou change d'interlocuteur.";
    return "Il n'a rien répondu" + (res.arret ? " (" + res.arret + ")" : "") + ". Réessaie.";
  }

  /* parler({sujet, roleId, echanges, surTexte, surFin, surErreur}) -> {annuler()} */
  function parler(o){
    var faux = {annuler:function(){}};
    var k = cle.lire();
    if(!k){ o.surErreur("Pas de clé sur cet appareil : colle-la dans « L'interlocuteur », en bas de la page."); return faux; }

    var flux = !!(window.ReadableStream && window.TextDecoder && window.AbortController);
    var ctrl = flux ? new AbortController() : null;
    var id = modele.lire(), m = leModele(id);

    function corpsDe(avecReglage){
      var c = {
        model: id,
        // Large exprès : s'il rédige en coulisse (bloc « thinking »), une limite
        // serrée mange tout le budget et il rend une réponse vide.
        max_tokens: 1500,
        system: consigne(o.sujet, role(o.roleId)),
        messages: messages(o.echanges)
      };
      if(avecReglage && m.reglage) Object.keys(m.reglage).forEach(function(k2){ c[k2] = m.reglage[k2]; });
      if(flux) c.stream = true;
      return c;
    }

    // Si l'API refuse le réglage de réflexion (il change d'un modèle à l'autre),
    // on repart une fois sans lui plutôt que de laisser tomber la discussion.
    function tenter(avecReglage){
      return fetch(URL_API, {
        method:"POST",
        headers:{
          "content-type":"application/json",
          "x-api-key":k,
          "anthropic-version":"2023-06-01",
          "anthropic-dangerous-direct-browser-access":"true"
        },
        body: JSON.stringify(corpsDe(avecReglage)),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function(r){
        if(!r.ok) return r.text().then(function(t){
          if(r.status === 400 && avecReglage && /thinking|effort|output_config/i.test(t)) return tenter(false);
          throw new Error(texteErreur(r.status, t));
        });
        if(flux && r.body && r.body.getReader) return lireFlux(r, o.surTexte);
        return r.json().then(function(d){
          var blocs = d.content || [];
          var t = blocs.map(function(b){ return (b && b.type === "text" && b.text) || ""; }).join("");
          var p = blocs.map(function(b){ return (b && b.thinking) || ""; }).join("").length;
          o.surTexte(t);
          return {texte:t, pense:p, arret:d.stop_reason || "", usage:{
            entree:(d.usage && d.usage.input_tokens) || 0,
            sortie:(d.usage && d.usage.output_tokens) || 0
          }};
        });
      });
    }

    tenter(true).then(function(res){
      if(res && res.usage) depense.ajouter(id, res.usage);
      var t = String((res && res.texte) || "").trim();
      if(!t) throw new Error(pourquoiRien(res || {}));
      o.surFin(t);
    }).catch(function(e){
      if(e && e.name === "AbortError") return;
      if(e instanceof TypeError)
        o.surErreur("Pas de réseau : l'interlocuteur a besoin d'une connexion.");
      else
        o.surErreur((e && e.message) || "Quelque chose n'a pas marché.");
    });

    return {annuler:function(){ if(ctrl) ctrl.abort(); }};
  }

  window.Discussion = {
    ROLES:ROLES, MODELES:MODELES, role:role,
    cle:cle, modele:modele, parler:parler,
    voix:voix, micro:micro, depense:depense
  };
})();
