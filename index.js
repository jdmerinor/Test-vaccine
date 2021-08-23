const puppeteer = require("puppeteer");
const fs = require("fs");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFirstAppointmentAsync(page) {
  const finalResponse = await page.waitForResponse(
    (response) =>
      response.url() ===
        "https://nswhvam.health.nsw.gov.au/api/sn_vaccine_sm/appointment/availability" &&
      response.status() === 200
  );
  const availabilityResponse = await finalResponse.json();
  const firstAvailableAppointment = availabilityResponse.result.data.find(
    (d) => d.noOfSlots > 0 && d.available
  );
  return firstAvailableAppointment;
}

async function getFirstAppointmentButtonAsync(container) {
  const button = await container.$(".btn.appointmentSlot");
  return button;
}

async function submitAsync(page) {
  const button = await page.$("#submitBtn");
  await button.click();
  await ringBellAsync(page);
}

async function ringBellAsync(page) {
  await page.evaluate(async () => {
    const audio = new Audio(
      "https://freesound.org/data/previews/66/66136_606715-lq.mp3"
    );
    async function notifyAsync() {
      while (true) {
        await audio.play();
      }
    }
    await notifyAsync();
  });
}

async function tryToGetAppointmentFromCalendarAsync(secondDosisCalendar, page) {
  const buttonsDays = await secondDosisCalendar.$$(
    'button[ng-if="day"]:not([disabled])[aria-pressed="false"]'
  );
  for (const buttonDay of buttonsDays) {
    await buttonDay.click();
    const availableDosis = await getFirstAppointmentAsync(page);
    if (availableDosis) {
      return availableDosis;
    }
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreDefaultArgs: ["--mute-audio"],
    args: ["--autoplay-policy=no-user-gesture-required"],
    defaultViewport: null,
  });
  const url =
    "https://nswhvam.health.nsw.gov.au/vam?id=reschedule_vaccination&taskId=CHANGEME!!!";
  const page = await browser.newPage();
  const cookies = JSON.parse(fs.readFileSync("./cookies.json", "utf-8"));
  await page.setCookie(...cookies);

  await page.goto(url);
  let appointmentFound = false;
  while (!appointmentFound) {
    try {
      const firstAppointment = await getFirstAppointmentAsync(page);
      if (firstAppointment) {
        const startDate = new Date(firstAppointment.start_date);
        const currentDate = new Date("Oct 6 2021");
        if (startDate < currentDate) {
          const appointmentButton = await getFirstAppointmentButtonAsync(page);
          await appointmentButton.click();
          let secondDosis = await getFirstAppointmentAsync(page);
          const appointmentContainers = await page.$$(
            ".appointmentContentContainer"
          );
          const secondDosisAppointmentContainer = appointmentContainers[1];
          if (secondDosis) {
            const secondButton = await getFirstAppointmentButtonAsync(
              secondDosisAppointmentContainer
            );
            await secondButton.click();
            await submitAsync(page);
          } else {
            const calendarContainers = await page.$$(".calendarContainer");
            const secondDosisCalendar = calendarContainers[1];
            secondDosis = await tryToGetAppointmentFromCalendarAsync(
              secondDosisCalendar,
              page
            );
            if (secondDosis) {
              const secondButton = await getFirstAppointmentButtonAsync(
                secondDosisAppointmentContainer
              );
              await secondButton.click();
              await submitAsync(page);
            }
            let secondPageButton = await secondDosisCalendar.$(
              "button#goNext:not([disabled])"
            );
            secondPageButton =
              secondPageButton ||
              (await secondDosisCalendar.$(
                "button#goPrevious:not([disabled])"
              ));

            if (secondPageButton) {
              await secondPageButton.click();
              secondDosis = await getFirstAppointmentAsync(page);
              if (secondDosis) {
                const secondButton = await getFirstAppointmentButtonAsync(
                  secondDosisAppointmentContainer
                );
                await secondButton.click();
                await submitAsync(page);
              }
              secondDosis = await tryToGetAppointmentFromCalendarAsync(
                secondDosisCalendar,
                page
              );
              if (secondDosis) {
                const secondButton = await getFirstAppointmentButtonAsync(
                  secondDosisAppointmentContainer
                );
                await secondButton.click();
                await submitAsync(page);
              }
            }
            await delay(30000);
          }
        }
      }
      await delay(5000);
      await page.reload();
    } catch (e) {
      if (e instanceof puppeteer.errors.TimeoutError) {
        await delay(30 * 60 * 1000);
      } else {
        throw e;
      }
    }
  }

  await browser.close();
})();
