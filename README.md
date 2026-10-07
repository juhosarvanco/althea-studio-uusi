# Althea – uuden version Studio

Tämä on oma, erillinen kopio Althean uudesta sivustoversiosta.
Vanhan sivuston repo, Studio, tekstit, kommentit ja historia eivät kuulu tähän tallennukseen.

- Sivusto: https://juhosarvanco.github.io/althea-studio-uusi/
- Studio: https://juhosarvanco.github.io/althea-studio-uusi/studio/
- Repo: https://github.com/juhosarvanco/althea-studio-uusi

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

- **Kommentoi aluetta** valitsee tekstin, katkelman, kuvan, painikkeen tai kokonaisen alueen.
  Sivupaneelista voi vaihtaa valinnan tasoa. Kommentit näkyvät molemmille.
- **Kuvat** avaa yhteisen kuvapankin. Voit lisätä kuvia ja valita niitä taustoihin tai
  sivun kuviin. Henkilökuville on omat paikat. Kuvan vaihto säilyttää tekstit ja kommentit.
- **Kohdan historia** näyttää valitun tekstin muutokset ja mahdollistaa sen palauttamisen.
- **Versiot** tallentaa nimetyn version ja näyttää automaattiset versiot.
- **Esikatsele** näyttää sivun ilman kirjoitustilaa.
- **Julkaise** julkaisee yhteisen työversion vain tähän uuteen repoon.
  GitHub Pages päivittyy julkaisun jälkeen. Molempien senhetkiset tekstit julkaistaan yhdessä.

Jos yhteys katkeaa, odota yhteyden palautumista ja tallennusilmoitusta ennen sivun sulkemista.
Palvelimelle jo tallennetut muutokset säilyvät myös tietokoneen sammuttamisen jälkeen.
Yhteyskatko ei poista muistettua kirjautumista. Studio yrittää yhteyttä uudelleen ja
hakee päivitetyn yhteysosoitteen automaattisesti.

Tekoälylle voi pyytää: **Lue ja toteuta uuden Studion avoimet muokkauskommentit**.
Sivun WebMCP-toiminnot antavat yhteiset tekstit ja kommentit kirjautuneessa Studiossa.
Sovelluksen omat annotate-kommentit kuuluvat siihen keskusteluun, jossa ne annettiin.

## Missä tiedot ovat

GitHub Pages näyttää sivuston ja Studion käyttöliittymän. Reaaliaikainen tallennuspalvelin
toimii aluksi Juhon Macilla omassa prosessissaan, portissa `8796`.
HTTPS-yhteyden välittää erillinen Cloudflare-tunneli.

Uuden Studion työversio, kommentit, kuvat ja historia ovat tämän projektin
`.studio-live/data/`-kansiossa. Niitä ei viedä julkiseen repoon.
GitHubissa on julkaistu sisältö ja editorin lähdekoodi.
Kirjautumisten yksityinen tallennus on saman kansion `github-sessions.enc`-tiedostossa.
Se salataan Studion omalla allekirjoitusavaimella; GitHubin käyttöoikeustunnuksia ei
tallenneta selaimeen, julkiseen repoon tai sivun sisältövienteihin.

Mac ja internetyhteys tarvitaan yhteismuokkaukseen. Näyttö saa sammua.
Julkinen GitHub Pages -sivu toimii myös Macin ollessa pois päältä.

## Palvelimen käyttö

```sh
npm ci
npm run build
npm run studio:start
npm run studio:status
```

Palvelimen voi käynnistää myös tämän kansion `Käynnistä uusi Studio.command`-tiedostosta.
Käynnistys päivittää uuden repon `STUDIO_SERVER_URL`-asetuksen ja julkaisee uuden yhteysosoitteen.
Se tarkistaa myös, vastaako etäyhteys oikeasti. Koneen sammuttamisen tai lepotilan jälkeen
vanhentunut yhteys uudistetaan automaattisesti käynnistyksen yhteydessä. GitHub Pagesin
päivitys voi kestää muutaman minuutin; päivitä sen jälkeen selaimen Studio-sivu.
Pelkkä katkenneen etäyhteyden korjaus säilyttää toimivan tallennuspalvelimen käynnissä.
Vanhan Studion palvelimeen tai Netlify-asetuksiin ei kosketa.

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
Studio rakennetaan `site/studio/`-kansioon. GitHub Actions julkaisee vain `site/`-kansion.

Yhteydenottolomake on edelleen kokeiltava työversio: siitä ei lähetetä viestejä tai tehdä
varauksia. Lopulliset yhteystiedot, ehdot ja lomakkeen lähetys lisätään erikseen.
