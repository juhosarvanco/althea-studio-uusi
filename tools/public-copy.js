const copy = {
  fi: {
    privacyTitle: 'Yhteydenottolomakkeen tietojen käsittely',
    privacy: 'Lomakkeella antamasi nimi, sähköpostiosoite ja viesti välitetään FormSubmit-palvelun kautta osoitteeseen info@althea.fi. Käytämme tietoja yhteydenottoosi vastaamiseen ja tutustumiskeskustelun sopimiseen. FormSubmit säilyttää lomakeviestit palvelussaan 30 päivää. Älä lähetä lomakkeella terveystietoja tai muita arkaluonteisia tietoja. Voit kysyä tietojesi käsittelystä tai pyytää niiden poistamista osoitteesta info@althea.fi.',
    termsTitle: 'Varaus- ja peruutusehdot',
    terms: 'Yhteydenottopyynnön lähettäminen ei ole varaus eikä edellytä maksua. Ohjelman varaus- ja peruutusehdot käydään läpi erikseen ennen varauksen vahvistamista.',
    sending: 'Lähetetään…',
    pending: 'Lähetetään yhteydenottopyyntöä…',
    successTitle: 'Kiitos yhteydenotosta!',
    success: 'Palaamme sinulle pian.',
    error: 'Lähetys ei onnistunut. Tietosi ovat tallella lomakkeessa. Yritä uudelleen tai lähetä viesti osoitteeseen info@althea.fi.',
  },
  en: {
    privacyTitle: 'How we use your contact details',
    privacy: 'The name, email address and message you enter in this form are forwarded via FormSubmit to info@althea.fi. We use these details to reply to your enquiry and arrange an introductory call. FormSubmit retains form submissions on its servers for 30 days. Please do not send health information or other sensitive information through this form. You can ask about how we handle your details or request their deletion by emailing info@althea.fi.',
    termsTitle: 'Booking and cancellation terms',
    terms: 'Sending a contact request does not make a booking or require payment. The programme’s booking and cancellation terms will be discussed separately before your booking is confirmed.',
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
