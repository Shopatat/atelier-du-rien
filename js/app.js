/* L'atelier du rien — toute la logique de l'appli.
   Rien à compiler : du JavaScript classique, servi tel quel.
   Les données (sujets, journal des publications, réglages) vivent dans le
   localStorage de l'appareil. Rien ne part sur un serveur : l'export et
   l'import servent à passer d'un appareil à l'autre. */
(function(){
  "use strict";

  var CLE_STOCK = "atelier-du-rien.v1";

  var ETATS = {
    idee:   {nom:"idée",      classe:"etat-idee"},
    choisi: {nom:"à tourner", classe:"etat-choisi"},
    tourne: {nom:"tourné",    classe:"etat-tourne"},
    publie: {nom:"publié",    classe:"etat-publie"}
  };
  var ORDRE_ETAT = ["choisi","tourne","idee","publie"];

  var sujets = {};          // id -> fiche
  var journal = {};         // "AAAA-MM-JJ" -> {sujetId, titre}
  var reglages = {cadence:5, tirage:null};
  var vue = {etat:"tous", tag:"", q:"", ouvert:null, form:null, suppr:null};
  var rendusEnAttente = false;
  var stockageOk = true;

  /* ---------- utilitaires ---------- */
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function el(id){ return document.getElementById(id); }
  function aujourdhui(){ return cle(new Date()); }
  function cle(d){
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }
  function depuisCle(k){
    var p = String(k).split("-");
    return new Date(Number(p[0]), Number(p[1])-1, Number(p[2]), 12, 0, 0, 0);
  }
  function jourPlus(d, n){ var x = new Date(d.getTime()); x.setDate(x.getDate()+n); return x; }
  function lundiDe(d){ var x = new Date(d.getTime()); x.setHours(12,0,0,0); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; }
  function slug(s){
    var base = String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"")
      .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60);
    if(!base) base = "sujet";
    var id = base, n = 2;
    while(sujets[id]) { id = base + "-" + n; n++; }
    return id;
  }
  function dateLongue(d){
    try{ return d.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"}); }
    catch(e){ return cle(d); }
  }
  function dateCourte(k){
    try{ return depuisCle(k).toLocaleDateString("fr-FR",{day:"numeric",month:"short"}); }
    catch(e){ return k; }
  }
  function liste(obj){
    return Object.keys(obj).map(function(id){
      var s = Object.assign({}, obj[id]); s.id = id; return s;
    });
  }
  function annonce(msg){
    var p = el("pied");
    p.textContent = msg;
    clearTimeout(annonce.t);
    annonce.t = setTimeout(function(){ p.textContent = "partir de rien · tenir le fil"; }, 5000);
  }

  /* ---------- stockage ---------- */
  function ficheLivree(s, i){
    return {
      titre:s.titre, croyance:s.croyance, retournement:s.retournement, accroche:s.accroche,
      temps:(s.temps||["","",""]).slice(), sortie:s.sortie,
      tags:(s.tags||[]).slice(), duree:s.duree || "", profondeur:s.profondeur || 1,
      etat:"idee", cree:aujourdhui(), ordre:i + 1, notes:"", lien:""
    };
  }
  function banqueLivree(){
    var n = {};
    (window.SUJETS || []).forEach(function(s, i){ if(s && s.id) n[s.id] = ficheLivree(s, i); });
    return n;
  }
  function charger(){
    var brut = null;
    try{ brut = window.localStorage.getItem(CLE_STOCK); }
    catch(e){ stockageOk = false; }
    if(brut){
      try{
        var d = JSON.parse(brut);
        sujets = (d && typeof d.sujets === "object" && d.sujets) || {};
        journal = (d && typeof d.journal === "object" && d.journal) || {};
        reglages.cadence = Number(d && d.reglages && d.reglages.cadence) || 5;
        reglages.tirage = (d && d.reglages && d.reglages.tirage) || null;
        return;
      }catch(e){ /* données illisibles : on repart de la banque livrée */ }
    }
    sujets = banqueLivree();
    journal = {};
    reglages = {cadence:5, tirage:null};
    sauver();
  }
  function sauver(){
    if(!stockageOk) return;
    try{
      window.localStorage.setItem(CLE_STOCK, JSON.stringify({
        version:1, sujets:sujets, journal:journal, reglages:reglages
      }));
    }catch(e){
      stockageOk = false;
      annonce("Impossible d'enregistrer sur cet appareil : les changements seront perdus en fermant la page.");
    }
  }

  /* ---------- écriture ---------- */
  function ecrireSujet(id, corps){
    sujets[id] = corps;
    sauver();
    rendreTout();
  }
  function supprimerSujet(id){
    delete sujets[id];
    if(reglages.tirage && reglages.tirage.sujetId === id) reglages.tirage = null;
    sauver();
    rendreTout();
  }
  function ecrireJournal(k, corps){
    journal[k] = corps;
    sauver();
  }
  function effacerJournal(k){
    delete journal[k];
    sauver();
  }

  /* ---------- tirage ---------- */
  function tagsRecents(){
    var ks = Object.keys(journal).sort().reverse().slice(0,3);
    var t = {};
    ks.forEach(function(k){
      var s = sujets[journal[k].sujetId];
      if(s && s.tags) s.tags.forEach(function(x){ t[x] = true; });
    });
    return t;
  }
  function tirer(){
    var tous = liste(sujets);
    var dispo = tous.filter(function(s){ return s.etat === "idee"; });
    if(!dispo.length) dispo = tous.filter(function(s){ return s.etat === "choisi" || s.etat === "tourne"; });
    if(!dispo.length) return null;
    var recents = tagsRecents();
    var frais = dispo.filter(function(s){
      return !(s.tags||[]).some(function(t){ return recents[t]; });
    });
    var panier = frais.length ? frais : dispo;
    return panier[Math.floor(Math.random() * panier.length)].id;
  }
  function nouveauTirage(){
    var ancien = reglages.tirage && reglages.tirage.sujetId;
    if(ancien && sujets[ancien] && sujets[ancien].etat === "choisi"){
      sujets[ancien] = Object.assign({}, sujets[ancien], {etat:"idee"});
    }
    var id = tirer();
    if(!id){ annonce("Plus aucun sujet disponible. Dépose une idée dans la banque."); return; }
    reglages.tirage = {date:aujourdhui(), sujetId:id};
    if(sujets[id].etat === "idee") sujets[id] = Object.assign({}, sujets[id], {etat:"choisi"});
    sauver();
    rendreTout();
    window.scrollTo({top:0, behavior:"smooth"});
  }
  function sujetDuJour(){
    var t = reglages.tirage;
    if(!t || !t.sujetId || !sujets[t.sujetId]) return null;
    return Object.assign({}, sujets[t.sujetId], {id:t.sujetId, tireLe:t.date});
  }

  /* ---------- statistiques ---------- */
  function serieCourante(){
    var auj = new Date(); auj.setHours(12,0,0,0);
    var depart = journal[cle(auj)] ? auj : jourPlus(auj,-1);
    var n = 0, d = depart;
    while(journal[cle(d)]){ n++; d = jourPlus(d,-1); }
    return n;
  }
  function meilleureSerie(){
    var ks = Object.keys(journal).sort();
    var best = 0, cour = 0, prec = null;
    ks.forEach(function(k){
      var d = depuisCle(k);
      if(prec && Math.round((d - prec)/86400000) === 1) cour++;
      else cour = 1;
      if(cour > best) best = cour;
      prec = d;
    });
    return best;
  }
  function compteSemaine(){
    var l = lundiDe(new Date()), n = 0;
    for(var i=0;i<7;i++){ if(journal[cle(jourPlus(l,i))]) n++; }
    return n;
  }
  function compteMois(){
    var m = aujourdhui().slice(0,8);
    return Object.keys(journal).filter(function(k){ return k.indexOf(m) === 0; }).length;
  }

  /* ---------- rendu : fiche ---------- */
  function puceEtat(etat){
    var e = ETATS[etat] || ETATS.idee;
    return '<span class="puce etat ' + e.classe + '">' + esc(e.nom) + '</span>';
  }
  function pucesTags(s){
    return (s.tags||[]).map(function(t){ return '<span class="puce">' + esc(t) + '</span>'; }).join("");
  }
  function champ(etiq, html){
    return '<div class="champ"><span class="etiquette">' + esc(etiq) + '</span>' + html + '</div>';
  }
  function ouManque(valeur, classe, manque){
    if(valeur && String(valeur).trim()) return '<p class="' + classe + '">' + esc(valeur) + '</p>';
    return '<p class="vide-champ">' + esc(manque) + '</p>';
  }
  function corpsFiche(s){
    var h = "";
    h += champ("Ce qu'on croit", ouManque(s.croyance, "croyance", "La croyance à retourner n'est pas encore écrite."));
    h += champ("Ce qu'on ne dit pas", ouManque(s.retournement, "retournement", "Le retournement reste à formuler."));
    h += champ("Accroche", ouManque(s.accroche, "accroche", "Pas d'accroche — c'est elle qui tient les dix premières secondes."));
    var t = (s.temps||[]).filter(function(x){ return x && String(x).trim(); });
    if(t.length){
      h += champ("Trois temps", '<ol class="temps">' + t.map(function(x){ return "<li><span>" + esc(x) + "</span></li>"; }).join("") + "</ol>");
    } else {
      h += champ("Trois temps", '<p class="vide-champ">Les trois temps ne sont pas posés.</p>');
    }
    h += champ("La sortie", ouManque(s.sortie, "sortie", "Pas de sortie écrite."));
    return h;
  }
  function boutonsFiche(s, contexte){
    var b = [];
    if(s.etat !== "publie"){
      b.push('<button class="bt bt-plein" data-act="plateau" data-id="' + esc(s.id) + '">Mode tournage</button>');
    }
    if(s.etat === "idee" || s.etat === "choisi"){
      b.push('<button class="bt" data-act="tourne" data-id="' + esc(s.id) + '">Je l\'ai tourné</button>');
    }
    if(s.etat !== "publie"){
      b.push('<button class="bt bt-publie" data-act="publie" data-id="' + esc(s.id) + '">Publié aujourd\'hui</button>');
    } else {
      b.push('<button class="bt bt-discret" data-act="depublie" data-id="' + esc(s.id) + '">Annuler la publication</button>');
    }
    if(contexte === "jour"){
      b.push('<button class="bt bt-discret" data-act="autre">Un autre sujet</button>');
      b.push('<button class="bt bt-discret" data-act="reporter" data-id="' + esc(s.id) + '">Reporter</button>');
    } else if(s.etat !== "publie"){
      b.push('<button class="bt bt-discret" data-act="prendre" data-id="' + esc(s.id) + '">Prendre pour aujourd\'hui</button>');
    }
    b.push('<button class="bt bt-discret" data-act="editer" data-id="' + esc(s.id) + '">Modifier</button>');
    if(contexte === "banque"){
      if(vue.suppr === s.id){
        b.push('<button class="bt bt-danger" data-act="supprimer-ok" data-id="' + esc(s.id) + '">Confirmer la suppression</button>');
        b.push('<button class="bt bt-discret" data-act="supprimer-non">Garder</button>');
      } else {
        b.push('<button class="bt bt-danger bt-mini" data-act="supprimer" data-id="' + esc(s.id) + '">Supprimer</button>');
      }
    }
    return '<div class="outils">' + b.join("") + "</div>";
  }
  function notesFiche(s){
    return '<div class="notes-zone">' +
      '<span class="etiquette">Notes de tournage</span>' +
      '<textarea id="notes-' + esc(s.id) + '" data-notes="' + esc(s.id) + '" placeholder="Ce que tu veux garder : une phrase trouvée, un angle, un rappel.">' + esc(s.notes || "") + '</textarea>' +
      '<input type="text" id="lien-' + esc(s.id) + '" data-lien="' + esc(s.id) + '" value="' + esc(s.lien || "") + '" placeholder="Lien de la vidéo publiée">' +
      '</div>';
  }

  var CERCLE = '<svg class="cercle-grand" viewBox="0 0 40 40" aria-hidden="true" fill="none">' +
    '<path d="M31 11.5C27.8 6.6 22.4 4 17 5.2 9.6 6.9 4.8 14.3 6.2 22.1c1.4 7.6 8.4 12.9 15.8 12 6.6-.8 11.7-6.2 12.4-13" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

  function rendreJour(){
    var zone = el("zone-jour");
    el("date-jour").textContent = dateLongue(new Date());

    if(!Object.keys(sujets).length){
      zone.innerHTML = '<div class="feuille tirage">' + CERCLE +
        '<h2>La banque est vide</h2>' +
        '<p>Dépose un premier sujet plus bas : un titre suffit pour commencer, la fiche se complète ensuite. ' +
        'Tu peux aussi remettre les sujets livrés avec l\'appli depuis « Tes données ».</p></div>';
      return;
    }

    var s = sujetDuJour();
    var dejaTire = s && reglages.tirage.date === aujourdhui();

    if(!s || !dejaTire){
      var dispo = liste(sujets).filter(function(x){ return x.etat === "idee"; }).length;
      zone.innerHTML = '<div class="feuille tirage">' + CERCLE +
        '<h2>Rien de tiré aujourd\'hui</h2>' +
        '<p>' + (dispo
          ? esc(dispo) + ' sujet' + (dispo>1?'s':'') + ' attendent dans la banque. Un clic et tu as une croyance à retourner, une accroche à dire, trois temps à tenir.'
          : 'Aucune idée neuve en réserve — reprends-en une dans la banque ou dépose-en une.') + '</p>' +
        '<button class="bt bt-plein" data-act="tirer">Tirer le sujet du jour</button>' +
        '</div>';
      return;
    }

    zone.innerHTML = '<article class="feuille fiche">' +
      '<div class="fiche-haut">' + puceEtat(s.etat) + pucesTags(s) +
        '<span class="puce">' + esc(s.duree || "durée libre") + '</span></div>' +
      '<h1>' + esc(s.titre) + '</h1>' +
      '<div class="fiche-corps">' + corpsFiche(s) + notesFiche(s) + '</div>' +
      boutonsFiche(s, "jour") +
      '</article>';
  }

  /* ---------- rendu : rythme ---------- */
  function rendreRythme(){
    var zone = el("zone-rythme");
    var auj = new Date(); auj.setHours(12,0,0,0);
    var cleAuj = cle(auj);
    var finSemaine = jourPlus(lundiDe(auj), 6);
    var debut = jourPlus(finSemaine, -69);

    var cells = "";
    for(var i=0;i<70;i++){
      var d = jourPlus(debut, i), k = cle(d);
      var cls = "jour";
      if(d > auj) cls += " jour-hors";
      else if(journal[k]) cls += " jour-pub";
      if(k === cleAuj) cls += " jour-auj";
      var titre = journal[k] ? dateCourte(k) + " — " + journal[k].titre : dateCourte(k);
      cells += '<i class="' + cls + '" title="' + esc(titre) + '"></i>';
    }

    var fait = compteSemaine(), but = reglages.cadence || 5;
    var pct = Math.min(100, Math.round(fait / but * 100));
    var opts = "";
    for(var n=1;n<=7;n++){
      opts += '<option value="' + n + '"' + (n === but ? " selected" : "") + ">" + n + "/semaine</option>";
    }

    var derniers = Object.keys(journal).sort().reverse().slice(0,4).map(function(k){
      return '<li><span class="puce">' + esc(dateCourte(k)) + '</span><em>' + esc(journal[k].titre) + '</em></li>';
    }).join("");

    zone.innerHTML =
      '<div class="grille-wrap"><div class="grille" role="img" aria-label="Publications des dix dernières semaines">' + cells + '</div></div>' +
      '<div class="rythme-pied">' +
        '<span class="jauge">cette semaine <b>' + fait + '/' + but + '</b>' +
          '<span class="jauge-barre"><i style="width:' + pct + '%"></i></span></span>' +
        '<label for="cadence">cadence<select id="cadence">' + opts + '</select></label>' +
      '</div>' +
      (derniers ? '<ul class="derniers">' + derniers + '</ul>'
                : '<p class="rythme-vide">Aucune publication enregistrée. Marque la première avec « Publié aujourd\'hui ».</p>');
  }

  /* ---------- rendu : banque ---------- */
  function rendreBanque(){
    var tous = liste(sujets);
    var cpt = {idee:0, choisi:0, tourne:0, publie:0};
    tous.forEach(function(s){ if(cpt[s.etat] != null) cpt[s.etat]++; });

    el("compte-banque").textContent = tous.length
      ? tous.length + " sujets · " + cpt.idee + " en réserve · " + cpt.publie + " publiés"
      : "";

    Array.prototype.forEach.call(document.querySelectorAll("#filtres .onglet"), function(b){
      b.setAttribute("aria-pressed", String(b.dataset.etat === vue.etat));
    });

    var sel = el("filtre-tag");
    var tags = {};
    tous.forEach(function(s){ (s.tags||[]).forEach(function(t){ tags[t] = (tags[t]||0)+1; }); });
    var noms = Object.keys(tags).sort(function(a,b){ return a.localeCompare(b,"fr"); });
    var attendu = noms.map(function(t){ return t + ":" + tags[t]; }).join("|");
    if(sel.dataset.sig !== attendu){
      sel.dataset.sig = attendu;
      sel.innerHTML = '<option value="">Tous les thèmes</option>' + noms.map(function(t){
        return '<option value="' + esc(t) + '">' + esc(t) + " (" + tags[t] + ")</option>";
      }).join("");
    }
    sel.value = vue.tag;

    var q = vue.q.trim().toLowerCase();
    var filtres = tous.filter(function(s){
      if(vue.etat !== "tous" && s.etat !== vue.etat) return false;
      if(vue.tag && (s.tags||[]).indexOf(vue.tag) === -1) return false;
      if(q){
        var foin = [s.titre, s.croyance, s.retournement, s.accroche, s.sortie, (s.tags||[]).join(" "), s.notes]
          .join(" ").toLowerCase();
        if(foin.indexOf(q) === -1) return false;
      }
      return true;
    });
    filtres.sort(function(a,b){
      var da = ORDRE_ETAT.indexOf(a.etat), dbb = ORDRE_ETAT.indexOf(b.etat);
      if(da !== dbb) return da - dbb;
      return (a.ordre||999) - (b.ordre||999);
    });

    var ul = el("liste");
    if(!filtres.length){
      ul.innerHTML = '<li class="liste-vide">' +
        (tous.length ? "Aucun sujet ne correspond." : "Rien encore. Dépose une idée au-dessus.") + "</li>";
      return;
    }
    ul.innerHTML = filtres.map(function(s){
      var ouvert = vue.ouvert === s.id;
      var sous = s.croyance || s.retournement || "Fiche à compléter";
      return '<li class="ligne">' +
        '<button class="ligne-tete" data-act="ouvrir" data-id="' + esc(s.id) + '" aria-expanded="' + ouvert + '">' +
          '<span class="ligne-titres"><h3>' + esc(s.titre) + '</h3>' +
            '<span class="ligne-sous">' + esc(sous) + '</span></span>' +
          '<span class="puces">' + puceEtat(s.etat) + '</span>' +
        '</button>' +
        (ouvert ? '<div class="ligne-detail"><div class="fiche-corps">' + corpsFiche(s) + notesFiche(s) + '</div>' +
                  boutonsFiche(s, "banque") + '</div>' : "") +
        '</li>';
    }).join("");
  }

  /* ---------- rendu : formulaire ---------- */
  function rendreForm(){
    var zone = el("zone-form");
    if(!vue.form){ zone.innerHTML = ""; return; }
    var id = vue.form === "nouveau" ? null : vue.form;
    var s = id ? (sujets[id] || {}) : {};
    var t = s.temps || ["","",""];
    function ligne(etiq, nom, val, ph){
      return '<div class="form-ligne"><label class="etiquette" for="f-' + nom + '">' + esc(etiq) + '</label>' +
        '<input type="text" id="f-' + nom + '" value="' + esc(val || "") + '" placeholder="' + esc(ph || "") + '"></div>';
    }
    function zoneTexte(etiq, nom, val, ph){
      return '<div class="form-ligne"><label class="etiquette" for="f-' + nom + '">' + esc(etiq) + '</label>' +
        '<textarea id="f-' + nom + '" placeholder="' + esc(ph || "") + '">' + esc(val || "") + '</textarea></div>';
    }
    zone.innerHTML = '<div class="feuille form">' +
      '<h3>' + (id ? "Modifier la fiche" : "Nouvelle fiche") + '</h3>' +
      ligne("Titre", "titre", s.titre, "Ce qu'on démystifie") +
      zoneTexte("Ce qu'on croit", "croyance", s.croyance, "La croyance, telle qu'on l'entend dire") +
      zoneTexte("Ce qu'on ne dit pas", "retournement", s.retournement, "Le retournement, en une ou deux phrases") +
      zoneTexte("Accroche", "accroche", s.accroche, "Les dix premières secondes, à dire telles quelles") +
      zoneTexte("Temps 1", "t0", t[0], "") +
      zoneTexte("Temps 2", "t1", t[1], "") +
      zoneTexte("Temps 3", "t2", t[2], "") +
      zoneTexte("La sortie", "sortie", s.sortie, "La dernière phrase, ou la question laissée") +
      '<div class="form-duo">' +
        ligne("Thèmes (séparés par des virgules)", "tags", (s.tags||[]).join(", "), "éveil, pièges") +
        ligne("Durée visée", "duree", s.duree, "4 min") +
      '</div>' +
      '<div class="outils"><button class="bt bt-plein" data-act="form-ok" data-id="' + esc(id || "") + '">Enregistrer</button>' +
        '<button class="bt bt-discret" data-act="form-annuler">Annuler</button></div>' +
      '</div>';
    var p = el("f-titre"); if(p) p.focus();
  }

  /* ---------- rendu : stats d'en-tête ---------- */
  function rendreStats(){
    var s = serieCourante();
    el("stats").innerHTML =
      '<div><b>' + s + '</b><span>' + (s === 1 ? "jour de suite" : "jours de suite") + '</span></div>' +
      '<div><b>' + compteMois() + '</b><span>ce mois</span></div>' +
      '<div><b>' + meilleureSerie() + '</b><span>record</span></div>';
  }

  // Un rendu complet remplace le HTML : on le reporte si le curseur est dans un champ.
  function rendreTout(){
    var actif = document.activeElement;
    if(actif && actif.dataset && (actif.dataset.notes || actif.dataset.lien || actif.id === "capture" ||
       actif.id === "recherche" || (actif.id||"").indexOf("f-") === 0)){
      rendusEnAttente = true;
      rendreStats();
      return;
    }
    rendusEnAttente = false;
    rendreStats();
    rendreJour();
    rendreRythme();
    rendreBanque();
    rendreForm();
  }

  /* ---------- mode tournage ---------- */
  var chrono = {t0:0, fige:0, actif:false, timer:null};
  function majChrono(){
    var s = chrono.actif ? Math.floor((Date.now() - chrono.t0)/1000) : chrono.fige || 0;
    el("chrono").textContent = String(Math.floor(s/60)).padStart(2,"0") + ":" + String(s%60).padStart(2,"0");
  }
  function ouvrirPlateau(id){
    var s = sujets[id];
    if(!s) return;
    var t = (s.temps||[]).filter(function(x){ return x && String(x).trim(); });
    el("plateau-corps").innerHTML =
      '<h2>' + esc(s.titre) + '</h2>' +
      (s.accroche ? champ("Accroche", '<p class="accroche">' + esc(s.accroche) + '</p>') : "") +
      (t.length ? champ("Trois temps", '<ol class="temps">' + t.map(function(x){ return "<li><span>" + esc(x) + "</span></li>"; }).join("") + "</ol>") : "") +
      (s.sortie ? champ("La sortie", '<p class="sortie">' + esc(s.sortie) + '</p>') : "") +
      (s.croyance ? champ("Ce qu'on croit", '<p class="croyance">' + esc(s.croyance) + '</p>') : "");
    el("plateau").hidden = false;
    el("plateau-fermer").focus();
  }
  function fermerPlateau(){
    el("plateau").hidden = true;
    chrono.actif = false; chrono.fige = 0;
    clearInterval(chrono.timer); chrono.timer = null;
    el("chrono").textContent = "00:00";
    el("chrono-bt").textContent = "Lancer";
  }

  /* ---------- actions ---------- */
  function marquer(id, etat){
    var s = sujets[id];
    if(!s) return;
    var n = Object.assign({}, s, {etat:etat});
    var k = aujourdhui();
    if(etat === "tourne") n.tourneLe = k;
    if(etat === "publie"){
      n.publieLe = k;
      ecrireJournal(k, {sujetId:id, titre:s.titre});
    }
    ecrireSujet(id, n);
    if(etat === "publie"){
      var serie = serieCourante();
      annonce("Publié. Série : " + serie + " jour" + (serie > 1 ? "s" : "") + ".");
    }
  }

  document.addEventListener("click", function(ev){
    var b = ev.target.closest("[data-act]");
    if(!b) return;
    var act = b.dataset.act, id = b.dataset.id;

    if(act === "ouvrir"){ vue.ouvert = vue.ouvert === id ? null : id; vue.suppr = null; rendreTout(); return; }
    if(act === "tirer" || act === "autre"){ nouveauTirage(); return; }
    if(act === "plateau"){ ouvrirPlateau(id); return; }
    if(act === "tourne"){ marquer(id, "tourne"); return; }
    if(act === "publie"){ marquer(id, "publie"); return; }
    if(act === "depublie"){
      var s = sujets[id];
      if(s && s.publieLe && journal[s.publieLe] && journal[s.publieLe].sujetId === id) effacerJournal(s.publieLe);
      var n = Object.assign({}, s, {etat:"tourne"}); delete n.publieLe;
      ecrireSujet(id, n);
      return;
    }
    if(act === "reporter"){
      reglages.tirage = null;
      ecrireSujet(id, Object.assign({}, sujets[id], {etat:"idee"}));
      return;
    }
    if(act === "prendre"){
      var anc = reglages.tirage && reglages.tirage.sujetId;
      if(anc && anc !== id && sujets[anc] && sujets[anc].etat === "choisi"){
        sujets[anc] = Object.assign({}, sujets[anc], {etat:"idee"});
      }
      reglages.tirage = {date:aujourdhui(), sujetId:id};
      if(sujets[id].etat === "idee") sujets[id] = Object.assign({}, sujets[id], {etat:"choisi"});
      sauver();
      rendreTout();
      window.scrollTo({top:0, behavior:"smooth"});
      return;
    }
    if(act === "editer"){ vue.form = id; rendreTout(); el("zone-form").scrollIntoView({behavior:"smooth", block:"center"}); return; }
    if(act === "form-annuler"){ vue.form = null; rendreTout(); return; }
    if(act === "form-ok"){ enregistrerForm(id || null); return; }
    if(act === "supprimer"){ vue.suppr = id; rendreTout(); return; }
    if(act === "supprimer-non"){ vue.suppr = null; rendreTout(); return; }
    if(act === "supprimer-ok"){ vue.suppr = null; vue.ouvert = null; supprimerSujet(id); return; }
  });

  function enregistrerForm(id){
    function v(n){ var e = el("f-" + n); return e ? e.value.trim() : ""; }
    var titre = v("titre");
    if(!titre){ annonce("Il faut au moins un titre."); var ft = el("f-titre"); if(ft) ft.focus(); return; }
    var base = id ? sujets[id] : {etat:"idee", cree:aujourdhui(), ordre:Object.keys(sujets).length + 1, notes:"", lien:""};
    var corps = Object.assign({}, base, {
      titre:titre,
      croyance:v("croyance"),
      retournement:v("retournement"),
      accroche:v("accroche"),
      temps:[v("t0"), v("t1"), v("t2")],
      sortie:v("sortie"),
      duree:v("duree"),
      tags:v("tags").split(",").map(function(x){ return x.trim(); }).filter(Boolean)
    });
    var cible = id || slug(titre);
    vue.form = null;
    vue.ouvert = cible;
    ecrireSujet(cible, corps);
    annonce(id ? "Fiche mise à jour." : "Sujet ajouté à la banque.");
  }

  function deposerCapture(){
    var i = el("capture"), titre = i.value.trim();
    if(!titre) return;
    var corps = {titre:titre, croyance:"", retournement:"", accroche:"", temps:["","",""], sortie:"",
                 tags:[], duree:"", profondeur:1, etat:"idee", cree:aujourdhui(),
                 ordre:Object.keys(sujets).length + 1, notes:"", lien:""};
    i.value = "";
    ecrireSujet(slug(titre), corps);
    annonce("Idée déposée. Complète la fiche quand tu veux.");
  }

  /* ---------- export / import ---------- */
  function exporter(){
    var paquet = {
      app:"atelier-du-rien", version:1, exporte:new Date().toISOString(),
      sujets:sujets, journal:journal, reglages:reglages
    };
    var url = URL.createObjectURL(new Blob([JSON.stringify(paquet, null, 2)], {type:"application/json"}));
    var a = document.createElement("a");
    a.href = url;
    a.download = "atelier-du-rien-" + aujourdhui() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    annonce("Export enregistré. Garde ce fichier : c'est toute ta banque.");
  }
  function importer(texte){
    var d;
    try{ d = JSON.parse(texte); }
    catch(e){ annonce("Ce fichier n'est pas un export de l'atelier."); return; }
    if(!d || typeof d !== "object" || typeof d.sujets !== "object" || !d.sujets){
      annonce("Ce fichier n'est pas un export de l'atelier."); return;
    }
    var ajoutes = 0, majs = 0;
    Object.keys(d.sujets).forEach(function(id){
      var s = d.sujets[id];
      if(!s || !s.titre) return;
      if(sujets[id]) majs++; else ajoutes++;
      sujets[id] = s;
    });
    if(d.journal && typeof d.journal === "object"){
      Object.keys(d.journal).forEach(function(k){
        if(d.journal[k] && d.journal[k].titre) journal[k] = d.journal[k];
      });
    }
    if(d.reglages){
      reglages.cadence = Number(d.reglages.cadence) || reglages.cadence;
      if(d.reglages.tirage) reglages.tirage = d.reglages.tirage;
    }
    sauver();
    rendreTout();
    annonce("Import : " + ajoutes + " fiche" + (ajoutes > 1 ? "s" : "") + " ajoutée" + (ajoutes > 1 ? "s" : "") +
            ", " + majs + " remplacée" + (majs > 1 ? "s" : "") + ".");
  }
  function completerAvecLivres(){
    var livree = banqueLivree(), n = 0, base = Object.keys(sujets).length;
    Object.keys(livree).forEach(function(id){
      if(!sujets[id]){ livree[id].ordre = base + (++n); sujets[id] = livree[id]; }
    });
    if(!n){ annonce("Les sujets livrés sont déjà tous dans la banque."); return; }
    sauver();
    rendreTout();
    annonce(n + " sujet" + (n > 1 ? "s" : "") + " livré" + (n > 1 ? "s" : "") + " remis dans la banque.");
  }

  /* ---------- branchements ---------- */
  el("bt-capture").addEventListener("click", deposerCapture);
  el("capture").addEventListener("keydown", function(e){ if(e.key === "Enter") deposerCapture(); });
  el("bt-nouveau").addEventListener("click", function(){ vue.form = "nouveau"; rendreTout(); });

  el("filtres").addEventListener("click", function(e){
    var b = e.target.closest(".onglet");
    if(!b) return;
    vue.etat = b.dataset.etat; rendreTout();
  });
  el("filtre-tag").addEventListener("change", function(){ vue.tag = this.value; rendreTout(); });
  var tRech;
  el("recherche").addEventListener("input", function(){
    var val = this.value;
    clearTimeout(tRech);
    tRech = setTimeout(function(){ vue.q = val; rendreBanque(); }, 180);
  });

  document.addEventListener("change", function(e){
    if(e.target.id === "cadence"){
      reglages.cadence = Number(e.target.value) || 5;
      sauver();
      rendreTout();
    }
  });

  // Les notes et le lien s'enregistrent quand on quitte le champ.
  document.addEventListener("blur", function(e){
    var t = e.target;
    if(!t || !t.dataset) return;
    var id = t.dataset.notes || t.dataset.lien;
    if(!id || !sujets[id]){ if(rendusEnAttente) rendreTout(); return; }
    var nom = t.dataset.notes ? "notes" : "lien";
    if((sujets[id][nom] || "") !== t.value){
      var n = Object.assign({}, sujets[id]);
      n[nom] = t.value;
      ecrireSujet(id, n);
    } else if(rendusEnAttente){ rendreTout(); }
  }, true);

  el("bt-export").addEventListener("click", exporter);
  el("bt-import").addEventListener("click", function(){ el("fichier-import").click(); });
  el("fichier-import").addEventListener("change", function(){
    var f = this.files && this.files[0];
    this.value = "";
    if(!f) return;
    var r = new FileReader();
    r.onload = function(){ importer(String(r.result || "")); };
    r.onerror = function(){ annonce("Le fichier n'a pas pu être lu."); };
    r.readAsText(f);
  });
  el("bt-completer").addEventListener("click", completerAvecLivres);

  el("plateau-fermer").addEventListener("click", fermerPlateau);
  el("chrono-bt").addEventListener("click", function(){
    if(chrono.actif){
      chrono.fige = Math.floor((Date.now() - chrono.t0)/1000);
      chrono.actif = false; clearInterval(chrono.timer); chrono.timer = null;
      this.textContent = "Reprendre";
    } else {
      chrono.t0 = Date.now() - (chrono.fige || 0) * 1000;
      chrono.actif = true;
      chrono.timer = setInterval(majChrono, 500);
      this.textContent = "Pause";
    }
    majChrono();
  });
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape" && !el("plateau").hidden) fermerPlateau();
  });

  // Au retour sur l'appli après minuit, la date du jour a bougé.
  document.addEventListener("visibilitychange", function(){
    if(!document.hidden) rendreTout();
  });

  charger();
  if(!stockageOk) annonce("Cet appareil n'autorise pas l'enregistrement : les changements seront perdus en fermant la page.");
  rendreTout();

  if("serviceWorker" in navigator){
    window.addEventListener("load", function(){
      navigator.serviceWorker.register("sw.js").catch(function(){});
    });
  }
})();
