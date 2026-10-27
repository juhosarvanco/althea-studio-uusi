const copy = {
  fi: {
    privacyTitle: 'Yhteydenottolomakkeen tietojen käsittely',
    privacy: 'Käytämme yhteystietojasi yhteydenottoosi vastaamiseen ja tutustumiskeskustelun järjestämiseen. Ajanvarauksessa nimi, puhelinnumero, mahdollinen sähköpostiosoite ja valittu aika käsitellään Cal.com-palvelussa. Varaus tallentuu yksityiseen Althea-kalenteriin iCloudissa. Ajanvarauskalenteri käyttää Cal.comin palvelua ja sen tietosuojakäytäntöä. WhatsApp-linkki avaa WhatsAppin; viesti lähetetään vasta, kun lähetät sen itse. WhatsApp käsittelee tietoja omien ehtojensa mukaisesti. Sähköpostilomakkeen nimi, sähköpostiosoite ja viesti välitetään FormSubmit-palvelun kautta osoitteeseen info@althea.fi. FormSubmit säilyttää lomakeviestit palvelussaan 30 päivää. Älä lähetä näiden kanavien kautta terveystietoja tai muita arkaluonteisia tietoja. Voit kysyä tietojesi käsittelystä tai pyytää niiden poistamista osoitteesta info@althea.fi.',
    termsTitle: 'Varaus- ja peruutusehdot',
    terms: 'Tutustumiskeskustelu on maksuton eikä sido osallistumaan ohjelmaan. Kalenterista varaamasi aika on varaus tutustumiskeskusteluun. Voit siirtää tai peruuttaa ajan varausvahvistuksen linkistä tai ottamalla yhteyttä osoitteeseen info@althea.fi. Sähköposti- tai WhatsApp-viestin lähettäminen ei varaa aikaa automaattisesti. Ohjelman varaus- ja peruutusehdot käydään läpi erikseen ennen ohjelmavarauksen vahvistamista.',
    sending: 'Lähetetään…',
    pending: 'Lähetetään yhteydenottopyyntöä…',
    successTitle: 'Kiitos yhteydenotosta!',
    success: 'Palaamme sinulle pian.',
    error: 'Lähetys ei onnistunut. Tietosi ovat tallella lomakkeessa. Yritä uudelleen tai lähetä viesti osoitteeseen info@althea.fi.',
  },
  en: {
    privacyTitle: 'How we use your contact details',
    privacy: 'We use your contact details to reply to your enquiry and arrange your introductory call. When you book, your name, phone number, optional email address and chosen time are processed by Cal.com. The booking is added to the private Althea calendar in iCloud. The booking calendar uses Cal.com and its privacy policy. The WhatsApp link opens WhatsApp; a message is sent only when you send it yourself. WhatsApp processes information under its own terms. The name, email address and message entered in the email form are forwarded via FormSubmit to info@althea.fi. FormSubmit retains form submissions on its servers for 30 days. Please do not send health information or other sensitive details through these channels. You can ask about how we handle your details or request their deletion by emailing info@althea.fi.',
    termsTitle: 'Booking and cancellation terms',
    terms: 'The introductory call is free and does not commit you to joining the programme. Selecting and confirming a time in the calendar books an introductory call. You can reschedule or cancel using the link in your booking confirmation or by contacting info@althea.fi. Sending an email or WhatsApp message does not automatically reserve a time. The programme’s booking and cancellation terms will be discussed separately before a programme booking is confirmed.',
    sending: 'Sending…',
    pending: 'Sending your request…',
    successTitle: 'Thank you for getting in touch!',
    success: 'We’ll get back to you soon.',
    error: 'Your message could not be sent. Your details are still in the form. Please try again or email info@althea.fi.',
  },
};

export function publicCopy(document) {
  return copy[document.documentElement?.lang?.toLowerCase().split('-')[0]] || copy.fi;
}
