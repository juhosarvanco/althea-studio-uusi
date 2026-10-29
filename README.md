# Althea – uuden version Studio

Tämä on oma, erillinen kopio Althean uudesta sivustoversiosta.
Vanhan sivuston repo, Studio, tekstit, kommentit ja historia eivät kuulu tähän tallennukseen.

- Sivusto: https://www.althea.fi/
- Studio: https://www.althea.fi/studio/
- Repo: https://github.com/juhosarvanco/althea-studio-uusi

## Englanninkielinen tarkistusversio

Englanninkielinen sivu on osoitteessa https://www.althea.fi/en/. Se on erillinen
20.10.2026 julkaistun suomenkielisen sivun käännös tiedostossa `site/en/index.html`.
Sivulla ei ole kielenvaihtopainikkeita, eikä suomenkieliseltä sivulta ole siihen linkkiä.
Hakukoneindeksointi on estetty tarkistuksen ajaksi.

Englantia muokataan osoitteessa https://www.althea.fi/en/studio/. Studion
**Sivuston kieli** -valikosta voi vaihtaa suomen ja englannin välillä.
Kummallakin kielellä on oma yhteinen työversio, kommentit, kuvapankki ja historia.
**Julkaise** päivittää vain valitun kielen sivun.
Suomenkieliset muutokset eivät käänny automaattisesti. Sama kirjautuminen toimii
molemmissa editoreissa. Molemmat sivut käyttävät samaa julkaistua kuvastoa ja
yhteydenottolomakkeen vastaanottajaa. Lomakkeen viestit ja tietotekstit valitaan sivun
kielen perusteella tiedostosta `tools/public-copy.js`.

## Julkinen yhteydenottolomake

Lomake lähettää yhteydenottopyynnöt FormSubmit-palvelun kautta osoitteeseen
`info@althea.fi`, myös Studion palvelimen ollessa pois päältä. Vierailijan sähköposti
on viestin vastausosoite. Vastaanottajan on vahvistettava FormSubmitin ensimmäinen
aktivointiviesti kerran ennen sähköpostitoimitusten alkamista.

Lähetys näyttää onnistumisen vain palvelun hyväksyttyä viestin. Epäonnistuminen
säilyttää syötetyt tiedot ja tarjoaa suoran sähköpostilinkin. Piilotettu täyttökenttä
suodattaa automaattisia roskapostilähetyksiä. Lomakkeen tietojen käsittely kerrotaan
sivuston tietopainikkeessa; lomakkeella ei pyydetä terveystietoja.

Julkisen lomakkeen logiikka on tiedostossa `tools/contact-form.js`. Studion osoite
säilyy samana, vaikka julkiselta sivulta poistettiin työversion palkki ja editorilinkki.

## Julian ja Juhon yhteismuokkaus

Avaa Studio ja valitse **Kirjaudu GitHubilla**. Studio näyttää GitHubin kertakäyttöisen
vahvistuskoodin. Avaa GitHub painikkeesta, syötä koodi ja hyväksy kirjautuminen.
Studio yhdistyy automaattisesti. Sallittuja tunnuksia ovat `juhosarvanco` ja `juliagrahn`.
GitHub-kirjautuminen pyytää vain käyttäjän tunnistamista, ei oikeuksia repositorioihin.
Kirjautuminen muistetaan samassa selaimessa 30 päivää, myös välilehden sulkemisen ja
palvelimen uudelleenkäynnistyksen jälkeen. Selainhistorian yhteydessä poistettavat
sivustotiedot, yksityinen selaus tai GitHub-oikeuden peruuttaminen voivat vaatia uuden
kirjautumisen. **Kirjaudu ulos** päättää kirjautumisen kyseisessä selaimessa.
Osallistujarivillä näkyy yksi ympyrä käyttäjää kohti. Ympyrän lisätiedot kertovat,
jos sama käyttäjä on avannut useita välilehtiä.

Klikkaa otsikkoa tai tekstikappaletta ja kirjoita. Muutokset välittyvät heti toiselle.
**Tallennettu yhteiseen versioon** kertoo, että palvelin on tallentanut muutokset.
Kirjoittaminen ei vielä muuta julkista sivua.

- **Tekoäly** valitsee tekstin, katkelman, kuvan, painikkeen tai kokonaisen alueen.
  Kommenttikentän valikosta voi vaihtaa valinnan tasoa. Kommentit näkyvät molemmille.
- **Kuvat** avaa yhteisen kuvapankin. Voit lisätä kuvia ja valita niitä taustoihin tai
  sivun kuviin. Henkilökuville on omat paikat. Kuvan vaihto säilyttää tekstit ja kommentit.
- **Muokkaa** näyttää valitun tekstin historian ja mahdollistaa palauttamisen.
- **Versiot** tallentaa nimetyn version ja näyttää automaattiset versiot.
- **Esikatsele** näyttää sivun ilman kirjoitustilaa.
- **Julkaise** julkaisee yhteisen työversion vain tähän uuteen repoon.
  GitHub Pages päivittyy julkaisun jälkeen. Molempien senhetkiset tekstit julkaistaan yhdessä.

Jos yhteys katkeaa, odota yhteyden palautumista ja tallennusilmoitusta ennen sivun sulkemista.
Palvelimelle jo tallennetut muutokset säilyvät myös tietokoneen sammuttamisen jälkeen.
Yhteyskatko ei poista muistettua kirjautumista. Studio yrittää yhteyttä uudelleen ja
hakee päivitetyn yhteysosoitteen automaattisesti. Jos GitHub-kirjautuminen on
vanhentunut tai peruttu, Studio pyytää kirjautumaan uudelleen. Yhteysvirheen
yhteydessä **Kirjaudu GitHubilla uudelleen** voi korvata vanhan selainistunnon.

Tekoälylle voi pyytää: **Lue ja toteuta uuden Studion avoimet muokkauskommentit**.
Sivun WebMCP-toiminnot antavat yhteiset tekstit ja kommentit kirjautuneessa Studiossa.
Sovelluksen omat annotate-kommentit kuuluvat siihen keskusteluun, jossa ne annettiin.

## Missä tiedot ovat

GitHub Pages näyttää sivuston ja Studion käyttöliittymän. Reaaliaikainen tallennuspalvelin
toimii aluksi Juhon Macilla omassa prosessissaan, portissa `8796`.
HTTPS-yhteyden välittää erillinen Cloudflare-tunneli.
Jos selaimen verkko ei tavoita tunnelin osoitetta tai salli WebSocket-yhteyttä,
Studio kokeilee automaattisesti HTTPS-varayhteyttä osoitteessa
`https://althea-studio-connect.netlify.app`. Se välittää tavallisia HTTPS-pyyntöjä
samalle palvelimelle. Molemmat yhteystavat käyttävät samoja käyttäjäoikeuksia,
työversioita, kommentteja, historiaa ja tallennuksen vahvistuksia.
Varayhteyden tiedot ovat `.studio-live/relay.json`-tiedostossa. Käynnistin päivittää
sen automaattisesti tunnelin osoitteen vaihtuessa. Netlify-yhteys käyttää Macille
jo tallennettua CLI-kirjautumista. Kumpaankaan vanhaan Netlify-sivustoon ei kosketa.

Uuden Studion työversio, kommentit, kuvat ja historia ovat tämän projektin
`.studio-live/data/`-kansiossa; englannin tiedot ovat sen `en/`-alikansiossa.
Niitä ei viedä julkiseen repoon.
GitHubissa on julkaistu sisältö ja editorin lähdekoodi.
Kirjautumisten yksityinen tallennus on saman kansion `github-sessions.enc`-tiedostossa.
Se salataan Studion omalla allekirjoitusavaimella; GitHubin käyttöoikeustunnuksia ei
tallenneta selaimeen, julkiseen repoon tai sivun sisältövienteihin.

Mac ja internetyhteys tarvitaan yhteismuokkaukseen. Näyttö saa sammua.
Julkinen GitHub Pages -sivu toimii myös Macin ollessa pois päältä.
Julia ja Juho voivat käyttää eri Wi-Fi- tai mobiiliverkkoja. Selain käyttää
julkista HTTPS-yhteyttä; Macin lähiverkon osoitetta ei jaeta muokkaajille.
Julkaisu estetään, jos etäyhteyden asetukseksi jäisi paikallinen osoite.

Internetistä tulevan yhteyden voi tarkistaa GitHub Actionsin manuaalisella
**Tarkista Studion yhteys ulkoverkosta** -työnkululla. Se tarkistaa DNS:n,
HTTPS:n, selaimen yhteysluvat ja molempien kielten WebSocket-yhteyden
GitHubin palvelimelta. Tarkistus ei käytä kirjautumistunnuksia eikä lue tekstejä
tai kommentteja. Sama tarkistus paikallisesti: `node tools/check-studio-connection.mjs`.

## Palvelimen käyttö

```sh
npm ci
npm run build
npm run studio:start
npm run studio:status
```

Kaksoisnapsauta tämän kansion **Käynnistä uusi Studio.command** -tiedostoa tai Macin
työpöydän **Käynnistä Althea Studio uudelleen.command** -pikakuvaketta.
Se käynnistää palvelimen myös silloin, kun se on sammunut, ja korjaa tarvittaessa etäyhteyden.
Odota ilmoitusta **VALMIS – Studio on käytettävissä**, ja päivitä selaimen Studio-sivu.
Voit sulkea käynnistysikkunan; palvelin jää käyntiin. Tallennetut tekstit, kommentit
ja kirjautumiset säilyvät. Jos Studio on jo käytössä, viimeistele kirjoittaminen ja
odota tallennusilmoitusta ennen uudelleenkäynnistystä. Samanaikaiset kaksoisnapsautukset
eivät käynnistä useita kilpailevia palvelimia.

Käynnistys päivittää uuden repon `STUDIO_SERVER_URL`-asetuksen ja julkaisee uuden yhteysosoitteen.
Se tarkistaa myös, vastaako etäyhteys oikeasti. Koneen sammuttamisen tai lepotilan jälkeen
vanhentunut yhteys uudistetaan automaattisesti käynnistyksen yhteydessä. GitHub Pagesin
päivitys voi kestää muutaman minuutin; päivitä sen jälkeen selaimen Studio-sivu.
Pelkkä katkenneen etäyhteyden korjaus säilyttää toimivan tallennuspalvelimen käynnissä.
Vanhan Studion palvelimeen tai Netlify-asetuksiin ei kosketa.

Käynnistyspainikkeen edellytykset voi tarkistaa muuttamatta käynnissä olevaa palvelinta:

```sh
./"Käynnistä uusi Studio.command" --check
```

```sh
node tools/studio-host.mjs restart  # koodipäivitys, sama etäyhteys
node tools/studio-host.mjs stop
```

Käynnistys ja uudelleenkäynnistys tekevät olemassa olevasta tallennuksesta varmuuskopion
`.studio-live/backups/`-kansioon. Säännöllinen erillinen varmuuskopio tarvitaan lisäksi.
Myöhempi palvelinsiirto tehdään kopioimalla myös koko tallennuskansio ja yksityinen `.env.studio`.

Palvelimella tarvitaan Node.js 22, GitHub CLI:n kirjautuminen tämän repon julkaisemiseen
sekä Cloudflared. GitHubin kirjautumissovellus on **Althea Studio – uusi versio**;
sen Client ID on julkinen tunniste. Device Flow on käytössä. Client secret -avainta ei tarvita.
Studion oma allekirjoitusavain luodaan paikallisesti ja säilyy vain `.env.studio`-tiedostossa.

## Ulkoasun muuttaminen

Tekstikohdilla ja sivun osilla on pysyvät tunnisteet. Tavallinen alueen siirtäminen,
lisääminen tai tyylien muuttaminen säilyttää olemassa olevat yhteiset tekstit.
Poistetut tekstikohdat jäävät arkistoon.

```sh
node tools/studio-layout.mjs export .studio-live/layout-draft.html
# Muokkaa rakennetta, säilytä olemassa olevat tunnisteet.
node tools/studio-layout.mjs apply .studio-live/layout-draft.html
```

Todellinen tekstin pilkkominen tai yhdistäminen tarvitsee erikseen tuoreen sisällön
tarkistamisen ja kommenttien siirtämisen. Älä tee sitä vanhasta valmistelutiedostosta
toisen kirjoittaessa. JavaScriptin ja Studion ohjelmakoodin muutokset julkaistaan
tavallisena koodipäivityksenä.

Julkaisu tarkistaa GitHubissa olevan vertailuversion ja päivittää haaran ilman pakotusta.
Rinnakkainen julkaisu tai Studion ulkopuolinen muutos ei saa korvata työversiota hiljaisesti.

## Kehitys ja tarkistukset

```sh
npm test
npm run build
```

Testit kattavat yhteismuokkauksen, historian, alueiden siirron, kuvat, kirjautumisen
ja julkaisemisen suojaamisen vanhalta tai ulkopuoliselta sisällöltä.
Paikallinen kokeilu käyttää erillistä tallennuskansiota:

```sh
STUDIO_DATA_DIR=/tmp/althea-uusi-kokeilu STUDIO_PORT=8797 STUDIO_DEV=1 node studio/server.mjs
```

Kokeilutila sallii vain paikallisen yhteyden eikä voi julkaista GitHubiin.
Editorit rakennetaan `site/studio/`- ja `site/en/studio/`-kansioihin.
GitHub Actions julkaisee vain `site/`-kansion.

Studio-esikatselun lomake ei lähetä viestejä. Julkinen lomake toimii FormSubmitin kautta.

## Studion tietoturva

Vain Juho ja Julia voivat kirjautua. GitHub-käyttäjänimen lisäksi tarkistetaan
alkuperäisen tilin pysyvä numerotunniste (`studio/auth.mjs`). Uuden käyttäjän
lisääminen vaatii molempien tunnisteiden hyväksymisen palvelimen asetuksissa ja koodissa.
GitHubin kaksivaiheinen tunnistautuminen pidetään käytössä molemmilla tileillä.

Muokkaus, kuvat, historia ja julkaisu vaativat allekirjoitetun, voimassa olevan
istunnon molemmilla kielillä ja molemmilla yhteysreiteillä. Uloskirjautuminen
mitätöi istunnon ja sulkee myös avoimet muokkausyhteydet. GitHub-tunnukset
säilytetään vain salattuina Macilla. Julkinen repositorio sisältää sivun lähdekoodin,
mutta ei salaisia avaimia, kirjautumistietoja tai yhteisiä kommentteja.

Studio estää ylimääräisen ohjelmakoodin suorittamisen selaimessa sekä käynnistymisen
toisen sivun kehyksessä. Julkaisutyön rakentaminen käyttää vain lukuoikeuksia;
erillinen julkaisu saa vain GitHub Pagesin tarvitsemat oikeudet. Ulkoiset Actions-osat
on sidottu tarkkoihin versiotunnisteisiin. Dependabot ehdottaa päivityksiä, mutta
niitä ei yhdistetä automaattisesti.

Macilla käynnistys käyttää ensisijaisesti `.studio-live/runtime/bin/node`-ohjelmaa,
jos sellainen on asennettu, ja muuten tavallista Node.js-ohjelmaa. Tietoturvatarkistuksessa
asennettiin Node.js 22.23.3:n virallinen arm64-versio ja tarkistettiin sen SHA-256-tiiviste.
Myös tämä ohjelma ja etäyhteysohjelma tarvitsevat myöhemmin tietoturvapäivityksiä.

```sh
node tools/check-studio-security.mjs
```

Tarkistus kokeilee ulkopuolisen luku- ja muokkausyrityksiä ilman oikeita tunnuksia
tai kelvollista julkaisuversiota. GitHubin käsin käynnistettävä yhteystarkistus
suorittaa saman kokeen ulkoverkosta. Tarkistus ei takaa ehdotonta turvallisuutta:
GitHub-, Netlify- ja verkkotunnustilien sekä Macin suojaaminen on edelleen välttämätöntä.

## Yhteinen Studio-käyttöliittymä (0.1.0)

Althean Studio käyttää samaa versioitua käyttöliittymäpakettia kuin 100HRS.
`vendor/studio-ui/origin.json` kertoo paketin tarkan lähdecommitin ja tiedostojen
tarkistussummat. Päivitys tehdään erikseen komennolla
`node tools/sync-studio-ui.mjs <100hrs-repon-40-merkkinen-commit>` ja tarkistetaan
`npm run build` sekä `npm test`. Rakentaminen ja palvelimen käynnistys eivät lataa
uutta pakettia verkosta.

- **Muokkaa**: kirjoita suoraan sivulle. Vasemmalla näkyy vain valitun tekstin
  nykyinen versio ja muutoshistoria palautuksineen.
- **Kuvat**: lataa kuvia kirjastoon, valitse sivun kuvakohta ja käytettävä kuva.
  Kuvan kuvaus ja rajaus ovat Kuvan asetukset -kohdassa. Poistot voi palauttaa.
- **Tekoäly**: valitse teksti, kuva tai laajempi alue ja kirjoita kommentti sen
  viereen avautuvaan kenttään. Kohdetason voi vaihtaa kentän ylävalikosta.
  Kommentit näkyvät yhteisessä sivupaneelissa. Tekoälypalvelun API-yhteyttä ei
  vielä ole: krediittisaldo on yhdistämättä ja Toteuta muutokset on pois käytöstä.
  Tehdyt muutokset -välilehdellä ei näytetä käsin tehtyjä muokkauksia.
- **Versiot** avaa saman levyisen sivupaneelin. Nimetty versio tallennetaan
  kentästä ja Avaa versio palauttaa sen yhteiseen työversioon. Julkinen sivu
  muuttuu vasta Julkaise-painikkeesta.
- Paneelin oikean reunan painike piilottaa ja avaa paneelin. Valinta muistetaan
  tässä selaimessa. Peru/uudelleen säilyttää yhteismuokkauksen oman käyttäjän rajauksen.

**Sivuston kieli** -valikosta voi vaihtaa nykyistä kieltä tai lisätä uuden.
Suomen ja englannin osoitteet ja tallennuskansiot säilyvät ennallaan. Uusi kieli
kopioidaan valitun kielen tämänhetkisestä työversiosta; käännöstä ei tehdä
itsestään. Uusi kieli avautuu esimerkiksi `/studio/?lang=sv`-osoitteessa,
ja julkaisu luo `/sv/`-sivun. Kielikohtaiset kommentit ja historia eivät kopioidu.
Enintään kahdeksan kieliversion rekisteri on yksityisessä
`.studio-live/data/languages.json`-tiedostossa. Lisäkielten tiedot säilyvät omissa
alikansioissaan. Althean Yjs-tallennus, GitHub-kirjautuminen, yhteismuokkaus ja
julkaisun ristiriitatarkistukset ovat edelleen Althean omassa palvelimessa.
