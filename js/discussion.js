/* L'interlocuteur — le pont vers l'API d'Anthropic.
   Ce fichier ne connaît rien de l'appli : on lui donne un sujet, un rôle et les
   échanges déjà dits, il rend ce que l'autre répond, mot à mot.
   La clé vit dans le localStorage de cet appareil, sous sa propre entrée : elle
   n'entre jamais dans l'export des fiches et ne part qu'à api.anthropic.com. */
(function(){
  "use strict";

  var CLE_API    = "atelier-du-rien.cle";
  var CLE_MODELE = "atelier-du-rien.modele";
  var URL_API    = "https://api.anthropic.com/v1/messages";
  var MODELE_PAR_DEFAUT = "claude-sonnet-5-5";
  var TOURS_ENVOYES = 24;   // on ne renvoie que la fin de la discussion

  var MODELES = [
    {id:"claude-sonnet-5-5", nom:"Vif",    note:"répond vite, bon pour enchaîner"},
    {id:"claude-opus-5-5",   nom:"Profond", note:"creuse plus loin, répond plus lentement"}
  ];

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
  function lireFlux(reponse, surTexte){
    var lect = reponse.body.getReader(), dec = new TextDecoder(), reste = "", texte = "", souci = null;
    return (function suite(){
      return lect.read().then(function(p){
        if(p.done) return texte;
        reste += dec.decode(p.value, {stream:true});
        var lignes = reste.split("\n");
        reste = lignes.pop();
        lignes.forEach(function(l){
          if(l.indexOf("data:") !== 0) return;
          var brut = l.slice(5).trim();
          if(!brut || brut === "[DONE]") return;
          var ev;
          try{ ev = JSON.parse(brut); }catch(e){ return; }
          if(ev.type === "content_block_delta" && ev.delta && typeof ev.delta.text === "string"){
            texte += ev.delta.text;
            surTexte(texte);
          } else if(ev.type === "error"){
            souci = (ev.error && ev.error.message) || "La réponse s'est interrompue.";
          }
        });
        if(souci) throw new Error(souci);
        return suite();
      });
    })();
  }

  /* parler({sujet, roleId, echanges, surTexte, surFin, surErreur}) -> {annuler()} */
  function parler(o){
    var faux = {annuler:function(){}};
    var k = cle.lire();
    if(!k){ o.surErreur("Pas de clé sur cet appareil : colle-la dans « L'interlocuteur », en bas de la page."); return faux; }

    var flux = !!(window.ReadableStream && window.TextDecoder && window.AbortController);
    var ctrl = flux ? new AbortController() : null;
    var corps = {
      model: modele.lire(),
      max_tokens: 500,
      system: consigne(o.sujet, role(o.roleId)),
      messages: messages(o.echanges)
    };
    if(flux) corps.stream = true;

    fetch(URL_API, {
      method:"POST",
      headers:{
        "content-type":"application/json",
        "x-api-key":k,
        "anthropic-version":"2023-06-01",
        "anthropic-dangerous-direct-browser-access":"true"
      },
      body: JSON.stringify(corps),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function(r){
      if(!r.ok) return r.text().then(function(t){ throw new Error(texteErreur(r.status, t)); });
      if(flux && r.body && r.body.getReader) return lireFlux(r, o.surTexte);
      return r.json().then(function(d){
        var t = (d.content || []).map(function(b){ return b.text || ""; }).join("");
        o.surTexte(t);
        return t;
      });
    }).then(function(t){
      t = String(t || "").trim();
      if(!t) throw new Error("Réponse vide. Réessaie.");
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
    cle:cle, modele:modele, parler:parler
  };
})();
